const fs = require('fs');
const cookieConfig = JSON.parse(fs.readFileSync(process.env.USERPROFILE + '\\.config\\flowcv\\config.json','utf8'));
const cookie = cookieConfig.cookie.includes('=') ? cookieConfig.cookie : `flowcvsidapp=${cookieConfig.cookie}`;
const resumeId = '5efbf77b-5eb8-4b20-9d9b-bd80125a5fa1';
(async () => {
  const res = await fetch(`https://app.flowcv.com/api/resumes/${resumeId}`, {headers:{Accept:'application/json', Cookie: cookie}, redirect:'manual'});
  const json = await res.json();
  console.log('status ok', res.status, 'success', json.success);
  console.log('keys', Object.keys(json.data?.resume?.content || {}));
  console.log(JSON.stringify(json.data?.resume?.content || {}, null, 2).slice(0, 12000));
})().catch(err=>{console.error(err); process.exit(1);});
