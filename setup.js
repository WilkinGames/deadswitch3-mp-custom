const fs = require('fs');
const crypto = require('crypto')

const connectionString = process.env.DATABASE_URL;

const { Client } = require('pg');

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
      currentDate = Date.now();
    } while (currentDate - date < milliseconds);
  }

var storage;
var myData;

try {
	storage = fs.readFileSync('./world.zip', { encoding: 'hex' });
  } catch(err) {
	console.log(err)
	return
  }
  //console.log(storage);
  client.connect();


const insertQuery = `
insert into files values('world.zip', bytea('`+ storage +`'))`;

const updateQuery = `
update files set file=bytea('`+ storage +`') where filename='world.zip'`;

const retreiveQuery = `
select convert_from(file, 'UTF-8') as file from files where filename='world.zip'`;

const setupQuery = `
create table files (filename text, file bytea)`

client.query(setupQuery, (err, res, fields) => {
  if (err) {
      console.error(err);
      return;
}
console.log('**script**: created table')
});

client.query(insertQuery, (err, res, fields) => {
    if (err) {
        console.error(err);
        return;
	}
  console.log('**script**: uploaded db')

  client.end();
});
