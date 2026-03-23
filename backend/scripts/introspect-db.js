const { Client } = require("pg");

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:123456@localhost:5432/sub_pm";

async function main() {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();

  if (process.argv[2] === "defaults") {
    const defaults = await client.query(`
      select table_schema, table_name, column_name, column_default, is_nullable
      from information_schema.columns
      where ((table_schema = 'public' and table_name like 'pm_%') or
             (table_schema = 'rz_ai' and table_name in ('sys_user', 'sys_dept', 'sys_tenant')))
        and column_name in ('id', 'user_id', 'dept_id')
      order by table_schema, table_name, ordinal_position
    `);

    console.log("==DEFAULTS==");
    for (const row of defaults.rows) {
      console.log(
        [row.table_schema, row.table_name, row.column_name, row.column_default, row.is_nullable].join("|"),
      );
    }

    await client.end();
    return;
  }

  const tables = await client.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'rz_ai')
      and table_type = 'BASE TABLE'
    order by table_schema, table_name
  `);

  console.log("==TABLES==");
  for (const row of tables.rows) {
    console.log(`${row.table_schema}.${row.table_name}`);
  }

  const columns = await client.query(`
    select table_schema, table_name, column_name, data_type, udt_name
    from information_schema.columns
    where (table_schema = 'public' and table_name like 'pm_%')
       or (table_schema = 'rz_ai' and table_name in ('sys_user', 'sys_dept', 'sys_tenant', 'sys_user_role'))
    order by table_schema, table_name, ordinal_position
  `);

  console.log("==COLUMNS==");
  for (const row of columns.rows) {
    console.log(
      [row.table_schema, row.table_name, row.column_name, row.data_type, row.udt_name].join("|"),
    );
  }

  await client.end();
}

main().catch((error) => {
  console.error(error.code || error.message);
  process.exit(1);
});
