var oracledb = require('oracledb');

var config = {
	user:'study',
	password:'study',
	connectString:'192.168.0.119:1521/Oracle8'
};

oracledb.getConnection(
  config,
  function(err, connection)
  {
    if (err) {
      console.error(err.message);
      return;
    }
　　//查询某表十条数据测试，注意替换你的表名
    connection.execute("SELECT * FROM \"STUDY\".\"Host\" where \"isNew\"=\'2\'",
      function(err, result_old)
      {
        if (err) {
          console.error(err.message);
          doRelease(connection);
          return;
        }
        //打印返回的表结构
        console.log(result_old.metaData);
        //打印返回的行数据
        console.log(result_old.rows);
		if (result_old.rows === undefined || result_old.rows.length == 0){
			console.log('数组为空');
		}
      });
  });

function doRelease(connection)
{
  connection.close(
    function(err) {
      if (err) {
        console.error(err.message);
      }
    });
}