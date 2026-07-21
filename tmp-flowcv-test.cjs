const { buildFlowCvDraft } = require('./tmp-flowcv/flowcv.js');
const fs = require('fs');
const text = `Andrii
About the job Fullstack Developer (Node.js/React) - Full Remote Europe
(Portu...
andreygriniha@gmail.com +48 572 180 328 Katowice, Poland
linkedin.com/in/andrii-hrynikha-8605ab374
SUMMARY
Here is the tailored resume based on the provided materials.
---
**ANDRII HRYNIKHA**
Full Stack Developer (Node.js/React)
**CONTACT**
Phone: +48 572 180 328
Email: andreygriniha@gmail.com
LinkedIn: www.linkedin.com/in/andrii-hrynikha-8605ab374
Location: Katowice, Poland (Available for Portugal Timezone)
**SUMMARY**
Full Stack Developer with a strong foundation in JavaScript (ES6+), React, and Node.js, complemented by
extensive experience in microservices architecture and API development. Proven ability to build scalable,
full-stack applications with a focus on clean code, testing, and containerization. Eager to apply a genuine
fullstack mindset to a collaborative, flat organization.
**EXPERIENCE**
**Full Stack Developer** | Andrii Co | Katowice, Poland | 2020 - Present
- Developed scalable full-stack applications using **React**, **TypeScript**, and **Node.js**-based
RESTful APIs.
- Built responsive frontend components and cross-platform solutions, ensuring a seamless user
experience.
**Software Engineer** | AMAGE Systems | Cracow, Poland | 2018 - 2020
- Built RESTful microservices using **Node.js** and **Express.js**-based frameworks, following SOA
principles.
**EDUCATION**
Bachelor of Computer Science | National Technical University of Ukraine | 2011 - 2015
**SKILLS**
- **Languages:** JavaScript (ES6+), TypeScript, C#, SQL
- **Backend & APIs:** Node.js, Express.js, REST APIs, GraphQL, Swagger/OpenAPI`;
const draft = buildFlowCvDraft({ profileName: 'Andrii Hrynikha', jd: 'Fullstack Developer', tailoredResume: text });
console.log(JSON.stringify({
  personalDetails: draft.personalDetails,
  summary: draft.summary,
  experienceCount: draft.sections.experience.entries.length,
  firstExperience: draft.sections.experience.entries[0],
  educationCount: draft.sections.education.entries.length,
  skillCount: draft.sections.skills.entries.length,
  firstSkill: draft.sections.skills.entries[0]
}, null, 2));
