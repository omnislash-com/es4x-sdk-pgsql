import { Tuple } from '@vertx/sql-client';

import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';
import { StringUtils } from 'es4x-utils/src/utils/StringUtils';
import { CoreUtils } from 'es4x-utils/src/utils/CoreUtils';

class	PGDBQuery
{
	constructor(_isBatch = false)
	{
		this.__query = "";
		this.__queryValues = [];
		this.__isBatch = _isBatch;
		this.__batchDynamicFields = [];
		this.__batchQueryValues = [];
	}

	isBatch()
	{
		return this.__isBatch;
	}

	addRowValuesToBatch(_data)
	{
		let	newQueryValues = [];
		for(let i=0; i<this.__batchDynamicFields.length; i++)
		{
			// get the value
			let	value = ObjUtils.GetValue(_data, this.__batchDynamicFields[i]);

			// array or object?
			if ( (CoreUtils.IsArray(value) == true) || (CoreUtils.IsObject(value) == true) )
			{
				value = JSON.stringify(value);			
			}

			// add it
			newQueryValues.push(value);
		}

		// add it
		this.__batchQueryValues.push(newQueryValues);
	}

	addValue(_value, _key="")
	{
		if (CoreUtils.IsString(_value) == true)
		{
			// internal methods
			let	methods = ["NOW()", "ALLBALLS()", "EPOC()"];
			if (methods.includes(_value) == true)
				return _value;

			// starts with methods
			let	startsWithMethods = ["to_timestamp("];
			for(let i=0; i<startsWithMethods.length; i++)
			{
				if (_value.startsWith(startsWithMethods[i]) == true)
					return _value;
			}		

			// add the increment / decrement?
			if (StringUtils.IsEmpty(_key) == false)
			{
				let	options = [
					_key + " + ",
					_key + "+",
					_key + "+ ",
					_key + " +",
					_key + " - ",
					_key + "-",
					_key + "- ",
					_key + " -",
				]
				for(let i=0; i<options.length; i++)
				{
					if (_value.startsWith(options[i]) == true)
						return _value;
				}
			}
		}

		// that field is dynamic! We're going to mark it
		if ( (StringUtils.IsEmpty(_key) == false) && (this.__isBatch == true) )
			this.__batchDynamicFields.push(_key);

		// if it's an object or array => stringify
		if ( (CoreUtils.IsArray(_value) == true) || (CoreUtils.IsObject(_value) == true) )
		{
			_value = JSON.stringify(_value);

			// add it to query values
			this.__queryValues.push(_value);

			return "CAST($" + this.__queryValues.length.toString() + "::text AS JSONB)";
		}
		else
		{
			_value = StringUtils.ToAny(_value);

			// is it a string?
			let	castType = "";
			if (CoreUtils.IsString(_value) == true)
			{
				// is it a cast?
				if (_value.startsWith("__CAST__") == true)
				{
					let	chunks = _value.split("::");
					if (chunks.length >= 2)
					{
						castType = chunks[0].replace("__CAST__", "");
						_value = chunks.splice(1);
					}
				}
				// is it STR?
				else if (_value.startsWith("__STR__") == true)
				{
					_value = _value.replace("__STR__", "");
				}
			}

			// cast?
			if (castType != "")
			{
				return "CAST('" + _value + "'::text AS " + castType + ")";
			}
			else
			{
				// add it to query values
				this.__queryValues.push(_value);

				return "$" + this.__queryValues.length.toString();
			}
		}
	}

	append(_str)
	{
		this.__query += _str;
	}

	appendConditionsToPreparedQuery(_conditions)
	{
		// add the conditions?
		if (_conditions.length > 0)
		{
			// rebuild the conditions for the prepared query
			let	delimiters = [">=", "<=", "<>", "=", "LIKE", ">", "<", "IN"];
			let	preparedQueryCondition = [];
			for(let i=0; i<_conditions.length; i++)
			{
				let	found = false;
				for(let j=0; j<delimiters.length; j++)
				{
					// split with '=$'
					let	chunks = _conditions[i].split(delimiters[j] + "$");

					// do we have chunks?
					if (chunks.length > 1)
					{
						// start with the left of the =
						let	newCondition = chunks[0];

						// IN type of condition?
						if (delimiters[j] == "IN")
						{
							// extract all the values
							let	inValues = chunks[1].split(" | ");
							if (inValues.length == 0)
								inValues.push(0);

							// build the final list
							newCondition += " IN (";
							for(let k=0; k<inValues.length; k++)
							{
								// add it as the prepared
								let	valueKey = this.addValue(inValues[k]);

								// add it in the new query
								if (k > 0)
									newCondition += ", ";
								newCondition += valueKey;
							}
							newCondition += ")";

							// add the condition
							preparedQueryCondition.push(newCondition);
						}
						else
						{
							// rebuild the condition
							let	conditionValue = chunks.slice(1).join(delimiters[j] + "$");

							// add it as the prepared
							let	valueKey = this.addValue(conditionValue);

							preparedQueryCondition.push(newCondition + delimiters[j] + " " + valueKey);
						}

						found = true;
						break;
					}
				}

				// no dynamic value, put the whole condition in it
				if (found == false)
					preparedQueryCondition.push(_conditions[i]);
			}

			// add it in the query
			this.append(" WHERE " + preparedQueryCondition.join(" AND "));
		}
	}

	getQuery()
	{
		return this.__query;
	}

	getBatch()
	{
		let	tupleList = [];

		// go through each one
		for(let i=0; i<this.__batchQueryValues.length; i++)
		{
			// create a new tuple from it
			let	newTuple = this.getTuple(this.__batchQueryValues[i]);

			// add it
			tupleList.push(newTuple);
		}

		return tupleList;
	}

	getTuple(_values = null)
	{
		// no values? we use ours
		if (_values == null)
			_values = this.__queryValues;

		let	tuple = Tuple.tuple();
		for(let i=0; i<_values.length; i++)
			tuple.addValue(_values[i]);
		return tuple;
	}

	static	InsertBatch(_table, _rows)
	{
		// no rows?
		if (_rows.length == 0)
			return null;

		// create a new query
		let	query = new PGDBQuery(true);

		// prepare the values for the query
		let	fields = [];
		let	preparedQueryKeys = [];
		for(let i=0; i<_rows.length; i++)
		{
			// first row? we prepare the query
			if (i == 0)
			{
				for(const key in _rows[i])
				{
					// add the value
					let	valueKey = query.addValue(_rows[i][key], key);

					fields.push(key);
					preparedQueryKeys.push(valueKey);
				}
			}

			// add it to the list of tuples
			query.addRowValuesToBatch(_rows[i]);
		}

		// build the query to insert
		query.append("INSERT INTO " + _table + " (" + fields.join(", ") + ") VALUES (" + preparedQueryKeys.join(", ") + ")");

		return query;
	}

	static	Insert(_table, _data, _returnId = false)
	{
		// create a new query
		let	query = new PGDBQuery();

		// prepare the values for the query
		let	fields = [];
		let	preparedQueryKeys = [];
		for(const key in _data)
		{
			// add the value
			let	valueKey = query.addValue(_data[key], key);

			fields.push(key);
			preparedQueryKeys.push(valueKey);
		}

		// build the query to insert
		query.append("INSERT INTO " + _table + " (" + fields.join(", ") + ") VALUES (" + preparedQueryKeys.join(", ") + ")");

		// return ID?
		if (_returnId == true)
			query.append(" RETURNING id");

		return query;
	}

	static	Update(_table, _data, _conditions)
	{
		// create a new query
		let	query = new PGDBQuery();

		// prepare the values for the query
		let	fieldsValues = [];
		for(const key in _data)
		{
			// add the value
			let	valueKey = query.addValue(_data[key], key);
			fieldsValues.push(key + "=" + valueKey);
		}

		// build the query to insert
		query.append("UPDATE " + _table + " SET " + fieldsValues.join(", "));

		// add the conditions
		query.appendConditionsToPreparedQuery(_conditions);

		return query;
	}

	static	Delete(_table, _conditions)
	{
		// create a new query
		let	query = new PGDBQuery();

		// build the query to insert
		query.append("DELETE FROM " + _table);

		// add the conditions
		query.appendConditionsToPreparedQuery(_conditions);

		return query;
	}

	static	Select(_tables, _conditions, _fields = [], _orderBy = [], _limit = -1, _groupBy = [], _offset = 0)
	{
		// create a new query
		let	query = new PGDBQuery();

		// Select
		query.append("SELECT ");
		
		// add the fields to retrieve
		if (_fields.length > 0)
		{
			query.append(_fields.join(", "));
		}
		else
		{
			query.append("*");
		}
		
		// table
		query.append(" FROM " + _tables.join(", "));
		
		// add the conditions?
		query.appendConditionsToPreparedQuery(_conditions);

		// group by?
		if (_groupBy.length > 0)
			query.append(" GROUP BY " + _groupBy.join(", "));

		// order by
		if (_orderBy.length > 0)
		{
			query.append(" ORDER BY ");
			for(let i=0; i<_orderBy.length; i++)
			{
				if (i > 0)
					query.append(", ");
				
				let	orderByValue = _orderBy[i];

				if (orderByValue.startsWith("-") == true)
				{
					orderByValue = orderByValue.replace("-", "");
					query.append(orderByValue + " DESC");
				}
				else
				{
					query.append(orderByValue);
				}
			}
		}

		// limit?
		if (_limit > 0)
			query.append(" LIMIT " + _limit);

		// offset?
		if (_offset > 0)
			query.append(" OFFSET " + _offset);

		return query;
	}
}

module.exports = {
	PGDBQuery
};
