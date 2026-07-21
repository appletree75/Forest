const fs = require('fs');
const { buildFlowCvDraft, createFlowCvResumeFromDraft } = require('./flowcv.js');
(async () => {
  try {
    const tailoredResume = fs.readFileSync('tmp-resume.txt', 'utf8');
    const jd = 'Fullstack Developer (Node.js/React) - Full Remote Europe';
    const draft = buildFlowCvDraft({ profileName: 'Andrii Hrynikha', jd, tailoredResume, baseResume: tailoredResume, instructions: '' });
    const result = await createFlowCvResumeFromDraft({ draft, profileName: 'Andrii Hrynikha' });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('FLOWCV_DEBUG_ERROR');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
})();

