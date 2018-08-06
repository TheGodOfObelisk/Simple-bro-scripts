var mysql = require('mysql');
var connection = mysql.createConnection({
	host:'192.168.0.123',
	user:'client',
	password:'123456',
	database:'net_test'
});

connection.connect();

var sql = 'select * from Port ORDER BY Pid DESC ';

connection.query(sql, function(error, results, fields){
     if (error) throw error;
     console.log('db connection started successfully!')
     console.log('The result is: ', results);
});
        
connection.end(function(err){
     if(err){
     console.err('fail to disconnect!');
     return;
     }
     console.log('db connection ended successfully!');
});