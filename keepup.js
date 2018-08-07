var oracledb = require('oracledb');

var config = {
	user:'study',
	password:'study',
	connectString:'192.168.0.119:1521/Oracle8'
};
oracledb.autoCommit = true;//取消数据回滚
var newIndividualAgentIP;//存放新个体节点的IP地址
var newIndividualAgentWeight;//存放新个体节点的权重

/*********************************
将[[....],[....],[....]]的形式转换为
[{....},{....},{....}]的形式
*********************************/
function HopenPortNumKVA(tip, tHopenPortNum, tportNumWeight){
	this.ip = tip;
	this.HopenPortNum = tHopenPortNum;
	this.portNumWeight = tportNumWeight;
}

function HserviceNumKVA(tip, tHserviceNum, tserviceWeight){
	this.ip = tip;
	this.HserviceNum = tHserviceNum;
	this.serviceWeight = tserviceWeight;
}

function HtrafficKVA(tip, tHtraffic, ttrafficWeight){
	this.ip = tip;
	this.Htraffic = tHtraffic;
	this.trafficWeight = ttrafficWeight;
}

function HfrequencyKVA(tip, tHfrequency, tfrequencyWeight){
	this.ip = tip;
	this.Hfrequency = tHfrequency;
	this.frequencyWeight = tfrequencyWeight;
}

function HservicePriorityKVA(tip, tservicePriority){
	this.ip = tip;
	this.servicePriority = tservicePriority;
}

function FinalWeightKVA(tip, tHweight){
	this.ip = tip;
	this.Hweight = tHweight;
}
/************************************************************
数据库操作：包括计算权值和决策两部分
权值计算：（涉及更新各个子权值，排序决定的子权值在赋值之前应当全部置零）
1.开放端口数：排序决定
2.业务种类：排序决定
3.通信量：排序决定
4.通信频次：排序决定
5.业务优先级：由最高的那个决定
属性值	分值
TELNET	10
SNMP	9
ICMP	8
DNS	    7
HTTP	6
FTP	    5
TFTP	4
NTP	    3
POP3	2
SMTP	1
6..总权值计算及更新
属性	比例	最高分值
业务优先级	0.3	10
业务种类	0.1	10
通信量	0.2	10
通信频次	0.2	10
操作系统	0.1	10
开放端口数	0.1	10
其中：操作系统：一一映射（模式匹配）数据融合阶段已完成
决策：
1.按总权值排序取主机信息
2.isAgent字段已为1的主机不参与决策
3.总权值并列第一的主机只取第一个（暂定）
4.优先在新发现的节点中选取（isnew字段为1）
5.收尾工作（把所有的isnew字段置为0,并将选取出来的新节点的isAgent字段置为1）
*************************************************************/
oracledb.getConnection(
	config,
	function(err, connection){//执行顺序用promise解决
		if(err) {
			console.error(err.message);
			return;
		}
		console.log('数据库已连接');
		clearWeightsInDB(connection).then(() => {
			calculateOpenportNumWeightInDB(connection).then(() => {
				calculateServiceNumWeightInDB(connection).then(() => {
					calculateTrafficWeightInDB(connection).then(() => {
						calculateFrequencyWeightInDB(connection).then(() => {
							calculateServicePriority(connection).then(() => {
								calculateTotalWeightInDB(connection).then(() => {
									decisionMaker(connection);
								});
							});
						});
					});
				});
			});
		});
		//calculateOpenportNumWeightInDB(connection);
		
		
});

/*0.将所有子权值字段重置*/
function clearWeightsInDB(connection){
	return new Promise((resolve, reject) => {
		function _clearWeightsInDB(connection){
			console.log('0.重置权值阶段');
			connection.execute("update \"STUDY\".\"Host\" set \"serviceWeight\"=0,  \"trafficWeight\"=0, \"frequencyWeight\"=0, \"portNumWeight\"=0, \"servicePriority\"=0,\"Hweight\"=0",
							   function(err){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject(err);
				}
				console.log('已重置权值字段（操作系统子权值除外），下面开始权值计算');
				resolve();
			});				
		}
		_clearWeightsInDB(connection);
	});
}

/*1.计算开放端口数子权值*/
function calculateOpenportNumWeightInDB(connection){
	return new Promise((resolve, reject) => {
		function _calculateOpenportNumWeightInDB(connection){
			console.log('1.计算开放端口子权值阶段');
			connection.execute("select \"IP\" as \"tIP\", \"HopenPortNum\" as \"tHopenPortNum\" from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ORDER BY \"HopenPortNum\" DESC",
						  function(err, result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('1.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('1.2计算数据阶段');
				let portNumArr = [];
				let iWeight = 10;
				//1.遍历结束退出循环
				//2.iWeight归零时退出循环
				for(let host of result.rows){
					//此处host[0]，host[1]分别代表ip和开放端口数，由于是端口数递减顺序，所以iWeight作为权值传入
					portNumArr.push(new HopenPortNumKVA(host[0], host[1], iWeight));
					if(--iWeight < 1)
						break;//仅前十名有效
				}
				console.log(portNumArr);
				console.log('1.3更新数据阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof portNumArr[iCount]); iCount++){
					console.log(portNumArr[iCount]["portNumWeight"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"portNumWeight\"=" + portNumArr[iCount]["portNumWeight"].toString() + "where \"IP\"=\'" + portNumArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});
				}
				while(typeof portNumArr[0] !== "undefined"){//有没有必要？
					portNumArr.pop();
					//console.log(portNumArr[0]);
				}
				resolve();
			});	
		}
		_calculateOpenportNumWeightInDB(connection);
	});
		
}

/*2.计算业务种类数子权值*/
function calculateServiceNumWeightInDB(connection){
	return new Promise((resolve,reject) => {
		function _calculateServiceNumWeightInDB(connection){
			console.log('2.计算服务种类个数子权值阶段');
			connection.execute("select \"IP\" as \"tIP\", \"HserviceNum\" as \"tHserviceNum\" from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ORDER BY \"HserviceNum\" DESC ", function(err,result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('2.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('2.2计算数据阶段');
				let serviceNumArr = [];
				let iServiceWeight = 10;
				//1.遍历结束退出循环
				//2.iServiceWeight归零时退出循环
				for(let host of result.rows){
					//此处host[0]，host[1]分别代表ip和服务数，由于是服务数递减顺序，所以iServiceWeight作为权值传入
					serviceNumArr.push(new HserviceNumKVA(host[0], host[1], iServiceWeight));
					if(--iServiceWeight < 1)
						break;//仅前十名有效
				}
				console.log(serviceNumArr);
				console.log('2.3数据更新阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof serviceNumArr[iCount]); iCount++){
					console.log(serviceNumArr[iCount]["serviceWeight"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"serviceWeight\"=" + serviceNumArr[iCount]["serviceWeight"].toString() + " where \"IP\"=\'" + serviceNumArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});
				}
				while(typeof serviceNumArr[0] !== "undefined")
					serviceNumArr.pop();
				resolve();
			});
		}
		_calculateServiceNumWeightInDB(connection);
	});
}

/*3.计算通信量子权值*/
function calculateTrafficWeightInDB(connection){
	return new Promise((resolve, reject) => {
		function _calculateTrafficWeightInDB(connection){
			console.log('3.计算通信量子权值字段');
			connection.execute("select \"IP\" as \"tIP\", \"Htraffic\" as \"tHtraffic\" from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ORDER BY \"Htraffic\" DESC ", function(err, result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('3.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('3.2计算数据阶段');
				let trafficArr = [];
				let iTrafficWeight = 10;
				//1.遍历结束退出循环
				//2.iTrafficWeight归零时退出循环
				for(let host of result.rows){
				//此处host[0]，host[1]分别代表ip和通信量，由于是通信量递减顺序，所以iTrafficWeight作为权值传入
					trafficArr.push(new HtrafficKVA(host[0], host[1], iTrafficWeight));
					if(--iTrafficWeight < 1)
						break;//仅前十名有效
				}
				console.log(trafficArr);
				console.log('3.3数据更新阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof trafficArr[iCount]); iCount++){
					console.log(trafficArr[iCount]["trafficWeight"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"trafficWeight\"=" + trafficArr[iCount]["trafficWeight"].toString() + " where \"IP\"=\'" + trafficArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});					
				}
				while(typeof trafficArr[0] !== "undefined")
					trafficArr.pop();
				resolve();
			});
		}
		_calculateTrafficWeightInDB(connection);
	});
}

/*4.计算通信频次子权值*/
function calculateFrequencyWeightInDB(connection){
	return new Promise((resolve, reject) => {
		function _calculateFrequencyWeightInDB(connection){
			console.log('4.计算通信频次子权值阶段');
			connection.execute("select \"IP\" as \"tIP\", \"Hfrequency\" as \"tHfrequency\" from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ORDER BY \"Hfrequency\" DESC ", function(err, result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('4.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('4.2计算数据阶段');
				let frequencyArr = [];
				let iFrequencyWeight = 10;
				//1.遍历结束退出循环
				//2.iFrequencyWeight归零时退出循环
				for(let host of result.rows){
					//此处host[0]，host[1]分别代表ip和通信频次，由于是通信频次递减顺序，所以iServiceWeight作为权值传入
					frequencyArr.push(new HfrequencyKVA(host[0], host[1], iFrequencyWeight));
					if(--iFrequencyWeight < 1)
						break;//仅前十名有效
				}
				console.log(frequencyArr);
				console.log('4.3数据更新阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof frequencyArr[iCount]); iCount++){
					console.log(frequencyArr[iCount]["frequencyWeight"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"frequencyWeight\"=" + frequencyArr[iCount]["frequencyWeight"].toString() + " where \"IP\"=\'" + frequencyArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});
				}
				while(typeof frequencyArr[0] !== "undefined")
					frequencyArr.pop();
				resolve();
			});
		}
		_calculateFrequencyWeightInDB(connection);
	});
}

/*5.计算业务优先级权值*/
function calculateServicePriority(connection){
	return new Promise((resolve, reject) => {
		function _calculateServicePriority(connection) {
		console.log('5.计算业务优先级阶段');
		connection.execute("select \"STUDY\".\"Host\".\"IP\" as \"tIP\", \"Stelnet\" as \"tStelnet\", \"Ssnmp\" as \"tSsnmp\", \"Sicmp\" as \"tSicmp\", \"Sdns\" as \"tSdns\", \"Shttp\" as \"tShttp\", \"Sftp\" as \"tSftp\", \"Stftp\" as \"tStftp\", \"Sntp\" as \"tSntp\", \"Spop3\" as \"tSpop3\", \"Ssmtp\" as \"tSsmtp\" from \"STUDY\".\"Host\", \"STUDY\".\"Service\" where \"isAgent\"=\'0\' and \"STUDY\".\"Host\".\"IP\"=\"STUDY\".\"Service\".\"IP\"", function(err,result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('5.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('5.2计算数据阶段');
				let servicePriorityArr = [];
				//遍历结束退出循环
				for(let host of result.rows){
					//host[0]: ip ; host[1]: telnet; host[2]: snmp; host[3]: icmp; host[4]: dns
					//host[5]: http; host[6]: ftp; host[7]: tftp; host[8]: ntp; host[9]: pop3;
					//host[10]: smtp; 
					if(host[1]){//telnet
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 10));
						continue;
					}
					if(host[2]){//snmp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 9));
						continue;
					}
					if(host[3]){//icmp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 8));
						continue;
					}
					if(host[4]){//dns
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 7));
						continue;
					}
					if(host[5]){//http
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 6));
						continue;
					}
					if(host[6]){//ftp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 5));
						continue;
					}
					if(host[7]){//tftp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 4));
						continue;
					}
					if(host[8]){//ntp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 3));
						continue;
					}
					if(host[9]){//pop3
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 2));
						continue;
					}
					if(host[10]){//smtp
						servicePriorityArr.push(new HservicePriorityKVA(host[0], 1));
						continue;
					}
				}
				console.log(servicePriorityArr);
				console.log('5.3数据更新阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof servicePriorityArr[iCount]); iCount++){
					console.log(servicePriorityArr[iCount]["servicePriority"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"servicePriority\"=" + servicePriorityArr[iCount]["servicePriority"].toString() + " where \"IP\"=\'" + servicePriorityArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});
				}
				while(typeof servicePriorityArr[0] !== "undefined")
					servicePriorityArr.pop();
				resolve();
			});
		}
		_calculateServicePriority(connection);
	});
}

/*6.计算总权值并更新*/
function calculateTotalWeightInDB(connection){
	return new Promise((resolve, reject) => {
		function _calculateTotalWeightInDB(connection){
			console.log('6.计算总权值及更新阶段');
			connection.execute("select \"IP\" as \"tIP\", \"serviceWeight\" as \"tserviceWeight\", \"trafficWeight\" as \"ttrafficWeight\", \"frequencyWeight\" as \"tfrequencyWeight\", \"portNumWeight\" as \"tportNumWeight\", \"servicePriority\" as \"tservicePriority\", \"osWeight\" as \"tosweight\" from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ", function(err, result){
				if(err){
					console.error(err.message);
					doRelease(connection);
					reject();
				}
				console.log('6.1取数据阶段');
				console.log(result.metaData);
				console.log(result.rows);
				console.log('6.2数据计算阶段');
				let targetWeightArr = [];
				let tmp_weight = 0;//用于暂存所得的总权值
				//遍历结束退出循环
				for(let host of result.rows){
					//host[0]: ip; host[1]: tserviceWeight; host[2]: ttrafficWeight; host[3]: tfrequencyWeight
					//host[4]: tportNumWeight; host[5]: tservicePriority; host[6]: tosweight
					//计算得到的总权值四舍五入
					tmp_weight = Math.round(0.1 * host[1] + 0.2 * host[2] + 0.2 * host[3] + 0.1 * host[4] + 0.3 * host[5] + 0.1 * host[6]);
					targetWeightArr.push(new FinalWeightKVA(host[0], tmp_weight));
				}
				console.log(targetWeightArr);
				console.log('6.3数据更新阶段');
				//此时iCount控制循环进行
				//遍历结束时退出循环
				for(let iCount = 0; "undefined" !== (typeof targetWeightArr[iCount]); iCount++){
					console.log(targetWeightArr[iCount]["Hweight"]);
					//sql语句逐条更新
					var sql_t = "update \"STUDY\".\"Host\" set \"Hweight\"=" + targetWeightArr[iCount]["Hweight"].toString() + " where \"IP\"=\'" + targetWeightArr[iCount]["ip"] + "\'";
					connection.execute(sql_t, function(err){
						if(err){
							console.error(err.message);
							doRelease(connection);
							reject();
						}
					});
				}
				while(typeof targetWeightArr[0] !== "undefined")
					targetWeightArr.pop();
				resolve();
			});
		}
		_calculateTotalWeightInDB(connection);
	});
}

function decisionMaker(connection){
		console.log('***********决策阶段*************');
		//首先选取同时满足isAgent=0和isNew=1的节点
		connection.execute("select \"IP\" as \"tIP\",\"Hweight\" as \"tHweight\"  from \"STUDY\".\"Host\" where \"isAgent\"=\'0\' ORDER BY \"Hweight\" DESC  ",
						function(err, result){
			if(err){
				console.error(err.message);
				doRelease(connection);
				return;
			}
			//打印返回的表结构
			console.log(result.metaData);
			//打印返回的行数据
			console.log(result.rows);
			newIndividualAgentWeight = 0;//初始设为0
			let objArr = [];
			//循环退出条件：
			//1.遍历完所有数据（成功或失败）
			//2.找到第一个满足要求的节点（提前退出）
			//选举要求：
			//权值最大且非子节点，同样权值取靠前的（暂定）
			for(let host of result.rows){
				//host[0]代表主机IP，host[1]代表主机权重
				objArr.push(new FinalWeightKVA(host[0], host[1]));//每次只保留一个
				console.log(objArr);
				console.log(objArr[0]["ip"]);
				if(typeof newIndividualAgentIP === "undefined")
					newIndividualAgentIP = objArr[0]["ip"];//期望见到第一个非子节点的节点时给它赋值
				if(newIndividualAgentWeight < objArr[0]["Hweight"]){//有权重更大且非子节点的节点，便更新，有必要，因为newIndividualAgentWeight的初始值为0
					newIndividualAgentWeight = objArr[0]["Hweight"];
					newIndividualAgentIP = objArr[0]["ip"];
				}
				if(newIndividualAgentWeight > objArr[0]["Hweight"]){
					console.log('到达临界点，退出循环');
					break;//降序排列，一旦出现比现在权值还要小的就没有必要再查找下去了
				}
				console.log(host);
				//console.log(host.("tIP"));
				//console.log(host[0]);
				//console.log(host[1]);
				objArr.pop();
			}
			if(typeof newIndividualAgentIP === "undefined"){
				console.log('错误，本轮没能决策出新节点');
				doRelease(connection);
				return;
			}
			console.log('本轮决策出的新的子节点的IP为：', newIndividualAgentIP);
			console.log('本轮决策出的新的子节点的权重为：', newIndividualAgentWeight);
			//....
			//别忘记最后还要更新该子节点的isAgent字段以及所有节点的isNew字段
			doRelease(connection);
		});
}

function doRelease(connection){
	connection.close(
		function(err){
			if(err){
				console.error(err.message);
			}
			console.log('数据库已断开');
		}
	);
}
