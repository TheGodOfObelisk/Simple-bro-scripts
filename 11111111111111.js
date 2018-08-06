/*
connection.execute("update \"STUDY\".\"Host\" set \"Hweight\"=11 where \"IP\"=\'192.168.0.101\'",
		function(err, result){
		if(err){
			console.error(err.message);
			doRelease(connection);
			return;
		}
	});
*///更新语句示例



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
					//此处host[0]，host[1]分别代表ip和服务数，由于是端口数递减顺序，所以iServiceWeight作为权值传入
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

select \"STUDY\".\"Host\".\"IP\" as \"tIP\", \"Stelnet\" as \"tStelnet\", \"Ssnmp\" as \"tSsnmp\", \"Sicmp\" as \"tSicmp\", \"Sdns\" as \"tSdns\", \"Shttp\" as \"tShttp\", \"Sftp\" as \"tSftp\", \"Stftp\" as \"tStftp\", \"Sntp\" as \"tSntp\", \"Spop3\" as \"tSpop3\", \"Ssmtp\" as \"tSsmtp\" from \"STUDY\".\"Host\", \"STUDY\".\"Service\" where \"isAgent\"=\'0\' and \"STUDY\".\"Host\".\"IP\"=\"STUDY\".\"Service\".\"IP\"