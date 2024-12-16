const ArangoChair = require('./arangochair')

let no4 = new ArangoChair({
  host: 'http://127.0.0.1',
  port: 8529,
  username: 'root',
  password: 'se',
  database: 'jayengan'
})

no4.subscribe({collection:'rekapObat'});
no4.on('rekapObat', (doc, type) => {
  console.log(Object.assign({}, JSON.parse(doc), {
    type
  }))
});

no4.on('error', (err, httpStatus, headers, body) => {
  console.errors({
    err, httpStatus, headers, body
  })
  no4.start();
});

;(async()=>{

  try {
    await no4.start();
  
  }catch(e){
    console.error(e)
  }


})()