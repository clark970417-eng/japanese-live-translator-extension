// This isolated visual fixture never accesses the extension's real storage.
window.chrome={storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,JSON.parse(localStorage.getItem(k)||'null')])),set:async values=>{for(const [key,value]of Object.entries(values))localStorage.setItem(key,JSON.stringify(value));}}}};
