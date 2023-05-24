/// <reference types="@vertx/core" />
// @ts-check
import { TestSuite } from '@vertx/unit';
import { ObjUtils } from 'es4x-utils/src/utils/ObjUtils';

import { PGDBMgr } from '../src/PGDBMgr';
import { PGDBQuery } from '../src/PGDBQuery';
const	config = require('./test_config.json');

const suite = TestSuite.create("ES4X Test: PGDBMgr");


// PGDBMgr
suite.test("PGDBMgr.SelectRow", async function (context) {

	let async = context.async();

	try
	{
		// read the configuration
		let	host = ObjUtils.GetValueToString(config, "config.host");
		let	user = ObjUtils.GetValueToString(config, "config.user");
		let	password = ObjUtils.GetValueToString(config, "config.password");
		let	db = ObjUtils.GetValueToString(config, "config.db");
		let	port = ObjUtils.GetValueToInt(config, "config.port");

		// connect
		let	dbMgr = await PGDBMgr.Create(vertx, host, user, password, db, port);

		// prepare the query
		let	tables = ObjUtils.GetValue(config, "tests.SelectRow.tables");
		let	fields = ObjUtils.GetValue(config, "tests.SelectRow.fields");
		let	conditions = ObjUtils.GetValue(config, "tests.SelectRow.conditions");
		let	query = PGDBQuery.Select(tables, conditions, fields);

		// run it
		let	row = await dbMgr.queryToRow(query);

		// make sure we have it
		context.assertNotNull(row);

		// run the tests
		let	tests = ObjUtils.GetValue(config, "tests.SelectRow.tests");
		for(let key in tests)
		{
			// get the value
			let	result = ObjUtils.GetValue(row, key);

			// make sure it's ok
			context.assertEquals(tests[key], result);
		}

		async.complete();
	}
	catch(e)
	{
		console.trace(e);
		async.complete();
	}
});

suite.run();
