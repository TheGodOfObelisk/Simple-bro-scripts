##! FTP brute-forcing detector, triggering when too many rejected usernames or
##! failed passwords have occurred from a single address.

@load base/protocols/ftp
@load base/frameworks/sumstats

@load base/utils/time


module FTP;

global potential_ftp_attackers : set[string];
global ftp_quests : set[string];
global potential_attacks_info : table[string] of count;

export {
	redef enum Notice::Type += {
		## Indicates a host bruteforcing FTP logins by watching for too
		## many rejected usernames or failed passwords.
		Bruteforcing
		# How to write a notice from my own data structures?
	};

	# Create an ID for our new stream. By convention, this is
	# called "MY_LOG".
	redef enum Log::ID += { MY_LOG,
							REQUEST_LOG };

	# Define the record type that will contain the data to log.
	type Info: record {
		ts: time	&log;
		id: conn_id &log;
	};

	type request_info: record{
		ts: time	&log;
		ftp_requester_ip: addr	&log;
		command: string		&log;
		username: string	&log;
		password: string	&log;
	};

	# Optionally, we can add a new field to the connection record so that
	# the data we are logging (our "Info" record) will be easily
	# accessible in a variety of event handlers.
	redef record connection += {
		# By convention, the name of this new field is the lowercase name
		# of the module.
		ftp: Info &optional;
	};
 
	## How many rejected usernames or passwords are required before being
	## considered to be bruteforcing.
	const bruteforce_threshold: double = 20 &redef;

	## The time period in which the threshold needs to be crossed before
	## being reset.
	const bruteforce_measurement_interval = 15mins &redef;
}

event bro_init(){
	print "ready to use SumStats";
	local r1: SumStats::Reducer = [$stream="ftp.failed_auth", $apply=set(SumStats::UNIQUE), $unique_max=double_to_count(bruteforce_threshold+2)];
	local r2: SumStats::Reducer = [$stream="ftp.success_auth", $apply=set(SumStats::SUM)];
	local r3: SumStats::Reducer = [$stream="ftp.failed_auth_sum", $apply=set(SumStats::SUM)];
	SumStats::create([$name = "ftp.success_auth",
					$epoch = 1min,
					$reducers = set(r2),
					$epoch_result(ts: time, key: SumStats::Key, result: SumStats::Result) = 
					{
						print key;
						print result;
						print fmt("Number of successful ftp login(s) from %s within one minute: %.0f", key$host, result["ftp.success_auth"]$sum);
					}]);
	SumStats::create([$name = "ftp.failed_auth_sum",
					$epoch = bruteforce_measurement_interval,
					$reducers = set(r3),
					$epoch_result(ts: time, key: SumStats::Key, result: SumStats::Result) = 
					{
						print fmt("Number of unsuccessful ftp logins(s) from %s within 15 minutes: %.0f", key$host, result["ftp.failed_auth_sum"]$sum);
					}]);
	SumStats::create([$name = "ftp-detect-bruteforcing",
	                $epoch = bruteforce_measurement_interval,
	                $reducers = set(r1),
	                $threshold_val(key: SumStats::Key, result: SumStats::Result) =
	                  	{
	                  	return result["ftp.failed_auth"]$num+0.0;
	                  	},
	                $threshold = bruteforce_threshold,
	                $threshold_crossed(key: SumStats::Key, result: SumStats::Result) =
	                  	{
	                  	local r = result["ftp.failed_auth"];
	                  	local dur = duration_to_mins_secs(r$end-r$begin);
	                  	local plural = r$unique>1 ? "s" : "";
	                  	local message = fmt("%s had %d failed logins on %d FTP server%s in %s", key$host, r$num, r$unique, plural, dur);
						print message;
	                  	NOTICE([$note = FTP::Bruteforcing,
	                  	        $src = key$host,
	                  	        $msg = message,
	                  	        $identifier = cat(key$host)]);
	                  	},
					$epoch_result(ts: time, key: SumStats::Key, result: SumStats::Result) = {
						for (e in result["ftp.failed_auth"]$unique_vals){
							print fmt("attacker wants to login %s via FTP", e$str);
						}
						# here is an output example below
						# ts: 1499171520.032659
						# key: [str=<uninitialized>, host=172.16.0.1]
						# result: {
						# [ftp.failed_auth] = [begin=1499170763.708863, end=1499171519.331044, num=2441, average=<uninitialized>, hll_unique=0, card=<uninitialized>, hll_error_margin=<uninitialized>, hll_confidence=<uninitialized>, last_elements=<uninitialized>, max=<uninitialized>, min=<uninitialized>, samples=[], sample_elements=0, num_samples=0, variance=<uninitialized>, prev_avg=<uninitialized>, var_s=0.0, std_dev=0.0, sum=0.0, topk=<uninitialized>, unique=1, unique_max=22, unique_vals={
						# [num=<uninitialized>, dbl=<uninitialized>, str=192.168.10.50]
						# }]
						# }
					}
					]);
}

# This event is handled at a priority higher than zero so that if
# users modify this stream in another script, they can do so at the
# default priority of zero.
event bro_init() &priority=5{
	# Create the stream. This adds a default filter automatically.
	Log::create_stream(FTP::MY_LOG, [$columns=Info, $path="ftp"]);

	Log::create_stream(FTP::REQUEST_LOG, [$columns=request_info, $path="ftp-request-info"]);
	# Add a new filter to the FTP::MY_LOG stream that logs only
	# timestamp and originator address.
	local filter: Log::Filter = [$name="orig-only", $path="origs",
								$include=set("ts", "id.orig_h")];
	Log::add_filter(FTP::MY_LOG, filter);
	# We can get a log file called origs.log using this filter
}

# Here I want to collect username and password sent by requesters.
event ftp_request(c :connection, command: string, arg: string){
	print "a ftp request occurred! ";
	if(command == "USER"){
		local rec1: FTP::request_info = [$ts = network_time(),  
										$ftp_requester_ip = c$id$orig_h,$command = command, 
										$username = arg, $password = ""];
		Log::write(FTP::REQUEST_LOG, rec1);
	} else if(command == "PASS"){
		local rec2: FTP::request_info = [$ts = network_time(), 
										$ftp_requester_ip = c$id$orig_h, $command = command, 
										$username = "", $password = arg];
		Log::write(FTP::REQUEST_LOG, rec2);
	}
}

event ftp_reply(c: connection, code: count, msg: string, cont_resp: bool){
	# logging
	local rec: FTP::Info = [$ts = network_time(), $id = c$id];
	# Store a copy of the data in the connection record so other 
	# event handlers can access it.
	# c$ftp = rec;
	Log::write(FTP::MY_LOG, rec);	
	local cmd = c$ftp$cmdarg$cmd;
	if (code == 331 || code == 332){
		print "request for a user name or password!";
	}
	if (code == 200){
		# print c;
		local test = fmt("%s", c$id$orig_h);
		if(test !in ftp_quests){
			add ftp_quests[test];
		} else {
			# this host has once established a ftp connection
			# maybe it is an attacker
			print "depulicate ftp connection (obviously the previous ftp connection has broken down)";
		}
		print fmt("a successful ftp login from %s!", c$id$orig_h);
		SumStats::observe("ftp.success_auth", SumStats::Key($host=c$id$orig_h), 
	                  SumStats::Observation($num=1));
	}
	if ( cmd == "USER" || cmd == "PASS" ){
		if ( FTP::parse_ftp_reply_code(code)$x == 5 ){
			# local test1 = fmt("%s", c$id$resp_h);
			local test2 = fmt("%s", c$id$orig_h);
			# if(test1 !in potential_ftp_attackers){
			# 	add potential_ftp_attackers[test1];
			# 	potential_attacks_info[test1] = 1;
			# } else {
			# 	potential_attacks_info[test1] += 1;
			# }
			if(test2 !in potential_ftp_attackers){
				add potential_ftp_attackers[test2];
				potential_attacks_info[test2] = 1;
			} else {
				potential_attacks_info[test2] += 1;
			}
			SumStats::observe("ftp.failed_auth", [$host=c$id$orig_h], [$str=cat(c$id$resp_h)]);
			SumStats::observe("ftp.failed_auth_sum", SumStats::Key($host=c$id$orig_h), 
	                  SumStats::Observation($num=1));
		}
	}
}

event bro_done(){
	print "finishing";
	print "here are(is) potential ftp attacker(s): ";
	print potential_ftp_attackers;
	print "here are hosts which established ftp connections successfully";
	print ftp_quests;
	print "here are poential attackers cooresponding to their attempt times";
	print potential_attacks_info;
	print "start checking...";
	for(e in potential_ftp_attackers){
		print fmt("check %s", e);
		if(e in ftp_quests){
			print fmt("It seems that %s is an attacker and it succeeded to login via ftp(input wrong password %d times).", e, potential_attacks_info[e]);
		} else {
			print fmt("%s failed to login via ftp", e);
		}
	}
	print "end checking...";
}