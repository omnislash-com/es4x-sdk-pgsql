
import { PgPool } from '@vertx/pg-client';
import { PoolOptions } from '@vertx/sql-client/options';
import { PgConnectOptions } from '@vertx/pg-client/options';

import { PGDBQuery } from './PGDBQuery';

import { LogUtils } from 'es4x-utils/src/utils/LogUtils';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { StringUtils } from 'es4x-utils/src/utils/StringUtils';
import { DateUtils } from 'es4x-utils/src/utils/DateUtils';
import { CoreUtils } from 'es4x-utils/src/utils/CoreUtils';

class	PGDBMgr
{
	constructor(_vertx, _host, _user, _password, _db, _port=0)
	{
		// save the vertx
		this.__vertx = _vertx;

		// prepare the connection
		this.__connectOptions = new PgConnectOptions()
			.setLogActivity(true)
			.setCachePreparedStatements(true)
			.setHost(_host)
			.setUser(_user)
			.setPassword(_password)
			.setDatabase(_db)
			.setReconnectAttempts(20)

		// port?
		if (_port > 0)
			this.__connectOptions.setPort(_port);

		// init the client to null (lazy loading)
		this.__client = null;
	}

	ensureConnection()
	{
		if (this.__client == null)
		{
			// Pool options
			let poolOptions = new PoolOptions().setMaxSize(1);

			// connect
			LogUtils.Log("Init client @" + this.__connectOptions.getHost() + ":" + this.__connectOptions.getPort());
			this.__client = PgPool.pool(this.__vertx, this.__connectOptions, poolOptions);
		}
	}

	async	queryToList(_queryObj)
	{
		// execute the query
		let	result = await this.queryFromObj(_queryObj);
		if (result == null)
			return [];

		// build the final list
		let	outputList = [];
		let	resultSet = result.iterator();
		while(resultSet.hasNext() == true)
		{
			let	row = resultSet.next();
			outputList.push(PGDBMgr.RowToJson(row));
		}

		return outputList;
	}

	async	queryToRow(_queryObj, _rowIndex=0)
	{
		// execute the query
		let	result = await this.queryFromObj(_queryObj);
		if (result == null)
			return null;

		// build the final list
		let	resultSet = result.iterator();
		let	currentIndex = 0
		while(resultSet.hasNext() == true)
		{
			let	row = resultSet.next();

			// is it the one?
			if (currentIndex == _rowIndex)
				return PGDBMgr.RowToJson(row);
			
			currentIndex++;
		}

		return null;
	}

	async	queryFromObj(_queryObj)
	{
		if (_queryObj == null)
			return null;

		// ensure the connection it good
		this.ensureConnection();

		LogUtils.Log("executing query: " + _queryObj.getQuery());
		try
		{
			let	result = null;
			// batch?
			if (_queryObj.isBatch() == true)
				result = await this.__client.preparedQuery(_queryObj.getQuery()).executeBatch(_queryObj.getBatch());
			else
				result = await this.__client.preparedQuery(_queryObj.getQuery()).execute(_queryObj.getTuple());

			return result;
		}
		catch(e)
		{
			LogUtils.LogError("Error executing query:", {"query": _queryObj.getQuery()});
			LogUtils.LogException(e);
			return null;
		}
	}

	async	insert(_table, _data, _returnId = false)
	{
		// prepare the query
		let	query = PGDBQuery.Insert(_table, _data, _returnId);

		// execute it
		let	ret = await this.queryFromObj(query);

		// return ID?
		if (_returnId == true)
		{
			// error?
			if (ret == null)
				return 0;

			let	resultSet = ret.iterator();
			while(resultSet.hasNext() == true)
			{
				let	row = resultSet.next();
				let	rowJson = PGDBMgr.RowToJson(row);
				return ObjUtils.GetValue(rowJson, "id", 0);
			}			

			return 0;
		}
		else
			return ret != null;
	}

	async	insertBatch(_table, _rows)
	{
		// prepare the query
		let	query = PGDBQuery.InsertBatch(_table, _rows);

		// execute it
		let	ret = await this.queryFromObj(query);

		return ret != null;
	}

	async	update(_table, _data, _conditions)
	{
		// create the query
		let	query = PGDBQuery.Update(_table, _data, _conditions);

		// execute it
		let	ret = await this.queryFromObj(query);

		return ret != null;
	}

	async	delete(_table, _conditions)
	{
		// create the query
		let	query = PGDBQuery.Delete(_table, _conditions);

		// execute it
		let	ret = await this.queryFromObj(query);

		return ret != null;
	}

	async	getValue(_table, _field, _recordId, _default = "", _fieldId = "id")
	{
		// build the query
		let	tables = [
			_table
		];

		let	fields = [
			_field
		];

		let	conditions = [
			_fieldId + "=$" + _recordId
		];

		// execute
		let	result = await this.queryFromConditionsToRow(tables, conditions, fields);

		if (result != null)
			return result[_field];
		else
			return _default;
	}

	async	max(_table, _field)
	{
		// build the query
		let	tables = [
			_table
		];

		let	fields = [
			"MAX(" + _field + ") as value"
		];

		// execute
		let	result = await this.queryFromConditionsToRow(tables, [], fields);

		if (result != null)
			return result["value"];
		else
			return 0;		
	}

	async	count(_table, _field, _recordId, _fieldId = "id")
	{
		let	conditions = [
			_fieldId + "=$" + _recordId
		];

		return await this.countFromConditions(_table, _field, conditions);
	}

	async	countFromConditions(_table, _field, _conditions)
	{
		// build the query
		let	tables = [
			_table
		];

		let	fields = [
			"COUNT(" + _field + ") as value"
		];

		// execute
		let	result = await this.queryFromConditionsToRow(tables, _conditions, fields);

		if (result != null)
			return result["value"];
		else
			return 0;
	}

	async	queryFromConditionsToList(_tables, _conditions, _fields = [], _orderBy = [], _limit = -1, _groupBy = [], _offset = 0)
	{
		// build the query
		let	query = PGDBQuery.Select(_tables, _conditions, _fields, _orderBy, _limit, _groupBy, _offset);

		// execute the query
		let	result = await this.queryToList(query);

		return result;
	}

	async	queryFromConditionsToRow(_tables, _conditions, _fields = [], _orderBy = [], _rowIndex=0, _groupBy = [], _offset = 0)
	{
		// build the query
		let	query = PGDBQuery.Select(_tables, _conditions, _fields, _orderBy, _rowIndex+1, _groupBy, _offset);

		// execute the query
		let	result = await this.queryToRow(query, _rowIndex);

		return result;
	}





	static	Create(_vertx, _host, _user, _password, _db, _port)
	{
		// create the new DB MGR
		let	newDB = new PGDBMgr(_vertx, _host, _user, _password, _db, _port);

		return newDB;
	}






	static	Field(_table, _field, _alias="", _method="")
	{
		// does it start with '-'?
		let	prefix = "";
		if (_field.startsWith("-") == true)
		{
			_field = _field.substring(1);
			prefix = "-";
		}

		let	fieldName = prefix + _table + '.' + _field;

		// method?
		if (StringUtils.IsEmpty(_method) == false)
			fieldName = _method + "(" + fieldName + ")";

		// alias?
		if (StringUtils.IsEmpty(_alias) == false)
			fieldName += " as " + _alias;

		return fieldName;
	}

	static	ConditionTimestamp(_field, _dateStr, _comparison = "=")
	{
		return _field + _comparison + PGDBMgr.StringToTimestamp(_dateStr);
	}

	static	StringToTimestamp(_dateStr)
	{
		return PGDBMgr.Timestamp(DateUtils.ParseToTimestamp(_dateStr));
	}

	static	Timestamp(_timestamp)
	{
		return "to_timestamp(" + _timestamp + ")";
	}

	static	TimestampNow(_deltaMinutes = 0)
	{
		return PGDBMgr.Timestamp((Date.now() / 1000 + _deltaMinutes*60));
	}

	static	ArrayToCast(_array, _type = "text")
	{
		let	output = "__CAST__" + _type + "[]::{";
		for(var i=0; i<_array.length; i++)
		{
			// comma
			if (i > 0)
				output += ", ";

			// text?
			if (_type == "text")
			{
				output += '"';

				let	value = _array[i].toString();
				value = StringUtils.ReplaceAll(value, "'", "''");

				output += value;

				output += '"';
			}
			else
				output += _array[i].toString();
		}
		output += "}";

		return output;
	}

	static	RowToJson(_row)
	{
		return CoreUtils.ReformatJSON(_row.toJson());
	}
}

module.exports = {
	PGDBMgr
};
