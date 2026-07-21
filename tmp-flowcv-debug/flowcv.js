"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFlowCvConfigured = isFlowCvConfigured;
exports.buildFlowCvResumeEditorUrl = buildFlowCvResumeEditorUrl;
exports.buildFlowCvDraft = buildFlowCvDraft;
exports.createFlowCvResumeFromDraft = createFlowCvResumeFromDraft;
exports.downloadFlowCvResumePdf = downloadFlowCvResumePdf;
const promises_1 = require("node:fs/promises");
const FLOWCV_BASE_URL = "https://app.flowcv.com";
const DEFAULT_TEMPLATE_RESUME_ID = "b2379a20-a3c2-4ac7-88c2-1ce3be10768e";
async function isFlowCvConfigured() {
    const cookie = await getFlowCvSessionCookie();
    return Boolean(cookie);
}
function buildFlowCvResumeEditorUrl(resumeId) {
    return `${FLOWCV_BASE_URL}/resume/${resumeId}`;
}
function buildFlowCvDraft(input) {
    const parsedResume = parseTailoredResume(input.tailoredResume, {
        fallbackProfileName: input.profileName?.trim() || "Candidate",
        fallbackJobTitle: deriveJobTitleFromJd(input.jd),
    });
    return {
        title: buildFlowCvResumeTitle(parsedResume.personalDetails.fullName, input.jd),
        profileName: parsedResume.personalDetails.fullName,
        jobTitle: parsedResume.personalDetails.jobTitle,
        summary: parsedResume.summary,
        personalDetails: parsedResume.personalDetails,
        jd: input.jd.trim(),
        baseResume: input.baseResume?.trim() || "",
        instructions: input.instructions?.trim() || "",
        sections: {
            profile: {
                entries: parsedResume.summary ? [parsedResume.summary] : [],
            },
            experience: {
                entries: parsedResume.experience,
            },
            education: {
                entries: parsedResume.education,
            },
            skills: {
                entries: parsedResume.skills,
            },
        },
    };
}
async function createFlowCvResumeFromDraft(input) {
    const title = input.draft.title;
    const allResumes = await getFlowCvResumeList();
    const templateResumeId = await getFlowCvTemplateResumeId();
    const reusableResume = findReusableFlowCvResume(allResumes, title, input.draft.profileName || input.profileName?.trim() || "");
    let resumeId = reusableResume?.id || "";
    if (!resumeId) {
        try {
            const duplicated = await flowCvApiRequest("/api/resumes/duplicate", {
                method: "POST",
                body: { duplicateId: templateResumeId },
            });
            resumeId = duplicated.data.resume.id;
        }
        catch (error) {
            if (error instanceof Error && /resume limit reached/i.test(error.message)) {
                throw new Error("FlowCV resume limit reached. Delete an old FlowCV resume or upgrade your FlowCV plan, then try again.");
            }
            throw error;
        }
    }
    await flowCvApiRequest("/api/resumes/rename_resume", {
        method: "PATCH",
        body: { resumeId, resumeTitle: title },
    });
    const duplicatedResume = await getFlowCvResume(resumeId);
    await flowCvApiRequest("/api/resumes/save_personal_details", {
        method: "PATCH",
        body: {
            resumeId,
            personalDetails: {
                ...duplicatedResume.personalDetails,
                fullName: input.draft.personalDetails.fullName ||
                    input.profileName?.trim() ||
                    duplicatedResume.personalDetails?.fullName ||
                    "Candidate",
                jobTitle: input.draft.personalDetails.jobTitle ||
                    duplicatedResume.personalDetails?.jobTitle ||
                    "",
                displayEmail: input.draft.personalDetails.displayEmail,
                phone: input.draft.personalDetails.phone,
                address: input.draft.personalDetails.address,
                website: input.draft.personalDetails.website,
                websiteLink: input.draft.personalDetails.websiteLink,
                social: {
                    ...(duplicatedResume.personalDetails?.social ?? {}),
                    linkedIn: input.draft.personalDetails.linkedIn
                        ? {
                            link: input.draft.personalDetails.linkedIn,
                            display: input.draft.personalDetails.linkedIn,
                        }
                        : undefined,
                },
            },
        },
    });
    const contentSections = duplicatedResume.content ?? {};
    for (const [sectionId, section] of Object.entries(contentSections)) {
        const entries = section?.entries ?? [];
        for (const entry of entries) {
            await deleteFlowCvEntry(resumeId, sectionId, entry.id);
        }
    }
    const profileSectionId = findSectionIdByType(contentSections, ["profile"]) || "profile";
    const experienceSectionId = findSectionIdByType(contentSections, [
        "experience",
        "custom",
        "custom2",
        "custom3",
        "custom4",
    ]) || "custom";
    const educationSectionId = findSectionIdByType(contentSections, ["education"]) || "education";
    const skillSectionId = findSectionIdByType(contentSections, [
        "skill",
        "customSkill1",
        "customSkill2",
    ]) || "skill";
    if (input.draft.summary) {
        await saveFlowCvEntry(resumeId, profileSectionId, {
            id: crypto.randomUUID(),
            text: input.draft.summary,
            isHidden: false,
        });
    }
    for (const entry of input.draft.sections.experience.entries) {
        await saveFlowCvEntry(resumeId, experienceSectionId, {
            id: crypto.randomUUID(),
            title: entry.title,
            subTitle: entry.company,
            location: entry.location,
            startDateNew: entry.startDateNew,
            endDateNew: entry.endDateNew,
            description: entry.description,
            isHidden: false,
        });
    }
    for (const entry of input.draft.sections.education.entries) {
        await saveFlowCvEntry(resumeId, educationSectionId, {
            id: crypto.randomUUID(),
            degree: entry.degree,
            school: entry.school,
            location: entry.location,
            startDateNew: entry.startDateNew,
            endDateNew: entry.endDateNew,
            description: entry.description,
            isHidden: false,
        });
    }
    for (const entry of input.draft.sections.skills.entries) {
        await saveFlowCvEntry(resumeId, skillSectionId, {
            id: crypto.randomUUID(),
            skill: entry.skill,
            level: entry.level,
            infoHtml: entry.infoHtml,
            isHidden: false,
        });
    }
    return {
        resumeId,
        title,
        openUrl: buildFlowCvResumeEditorUrl(resumeId),
        previewUrl: buildFlowCvResumeEditorUrl(resumeId),
    };
}
async function downloadFlowCvResumePdf(resumeId) {
    await waitForFlowCvExport(900);
    const retryDelaysMs = [1500, 3000, 5000];
    let lastError = null;
    for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        try {
            return await flowCvBinaryRequest("/api/resumes/download", {
                method: "GET",
                params: { resumeId },
            });
        }
        catch (error) {
            lastError =
                error instanceof Error
                    ? error
                    : new Error("Unable to download the FlowCV PDF.");
        }
        await waitForFlowCvExport(retryDelaysMs[attempt]);
    }
    throw (lastError ?? new Error("Unable to download the FlowCV PDF from FlowCV."));
}
async function saveFlowCvEntry(resumeId, sectionId, entry) {
    await flowCvApiRequest("/api/resumes/save_entry", {
        method: "PATCH",
        body: {
            resumeId,
            sectionId,
            entry,
        },
    });
}
async function deleteFlowCvEntry(resumeId, sectionId, entryId) {
    await flowCvApiRequest("/api/resumes/delete_entry", {
        method: "DELETE",
        params: {
            resumeId,
            sectionId,
            entryId,
        },
    });
}
async function getFlowCvResume(resumeId) {
    const response = await flowCvApiRequest(`/api/resumes/${resumeId}`);
    return response.data.resume;
}
async function getFlowCvResumeList() {
    const listResponse = await flowCvApiRequest("/api/resumes/all");
    return listResponse.data.resumes ?? [];
}
async function getFlowCvTemplateResumeId() {
    const preferredTemplateId = process.env.FLOWCV_TEMPLATE_RESUME_ID?.trim() ||
        DEFAULT_TEMPLATE_RESUME_ID;
    try {
        await getFlowCvResume(preferredTemplateId);
        return preferredTemplateId;
    }
    catch {
        const resumes = await getFlowCvResumeList();
        const firstResume = resumes[0];
        if (!firstResume?.id) {
            throw new Error("No FlowCV template resume is available. Create one in FlowCV first.");
        }
        return firstResume.id;
    }
}
function buildFlowCvResumeTitle(profileName, jd) {
    const dateLabel = new Date().toISOString().slice(0, 10);
    const candidate = profileName?.trim() || "Candidate";
    const jobTitle = deriveJobTitleFromJd(jd);
    if (jobTitle) {
        return `${candidate} - ${jobTitle} - ${dateLabel}`;
    }
    return `${candidate} - Tailored Resume - ${dateLabel}`;
}
function findReusableFlowCvResume(resumes, desiredTitle, profileName) {
    const normalizedTitle = normalizeResumeLookupValue(desiredTitle);
    const normalizedProfileName = normalizeResumeLookupValue(profileName);
    const exactMatch = resumes.find((resume) => normalizeResumeLookupValue(resume.title || "") === normalizedTitle);
    if (exactMatch) {
        return exactMatch;
    }
    if (normalizedProfileName) {
        const profileMatch = resumes.find((resume) => normalizeResumeLookupValue(resume.title || "").includes(normalizedProfileName));
        if (profileMatch) {
            return profileMatch;
        }
    }
    return null;
}
function normalizeResumeLookupValue(value) {
    return value.trim().toLowerCase();
}
function deriveJobTitleFromJd(jd) {
    const firstMeaningfulLine = jd
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);
    if (!firstMeaningfulLine) {
        return "";
    }
    return firstMeaningfulLine.length > 80
        ? `${firstMeaningfulLine.slice(0, 77).trimEnd()}...`
        : firstMeaningfulLine;
}
function parseTailoredResume(text, options) {
    const normalizedText = normalizeResumeText(text);
    const structuredText = extractStructuredResumeText(normalizedText);
    const sections = splitResumeSections(structuredText);
    const contactLines = extractContactLines(structuredText, sections);
    const personalDetails = parsePersonalDetails(contactLines, options);
    return {
        personalDetails,
        summary: parseSummary(sections.summary, structuredText),
        experience: parseExperience(sections.experience),
        education: parseEducation(sections.education),
        skills: parseSkills(sections.skills),
    };
}
function normalizeResumeText(text) {
    return text
        .replace(/\r/g, "")
        .replace(/[–—]/g, "-")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/^---$/gm, "")
        .trim();
}
function extractStructuredResumeText(text) {
    const lines = text.split("\n");
    const candidateStartIndex = lines.findIndex((line, index) => {
        const stripped = stripMarkdownDecorations(line);
        const normalized = stripped.toLowerCase();
        if (!stripped || stripped.length > 80) {
            return false;
        }
        if ([
            "contact",
            "summary",
            "professional summary",
            "experience",
            "work experience",
            "professional experience",
            "education",
            "academic background",
            "skills",
            "technical skills",
            "core skills",
        ].includes(normalized)) {
            return false;
        }
        const alphaOnly = stripped.replace(/[^A-Za-z\s.-]/g, "").trim();
        if (!alphaOnly || alphaOnly.length < 5) {
            return false;
        }
        const isLikelyName = /^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,4}$/.test(stripped) ||
            /^[A-Z][A-Z\s'.-]{4,}$/.test(stripped);
        if (!isLikelyName) {
            return false;
        }
        const nearbyWindow = lines
            .slice(index, Math.min(lines.length, index + 8))
            .map((part) => stripMarkdownDecorations(part).toLowerCase());
        return nearbyWindow.some((part) => ["contact", "summary", "experience", "education", "skills"].includes(part));
    });
    if (candidateStartIndex >= 0) {
        return lines.slice(candidateStartIndex).join("\n").trim();
    }
    const firstSectionIndex = lines.findIndex((line) => {
        const normalized = stripMarkdownDecorations(line)
            .replace(/[:]+$/g, "")
            .trim()
            .toLowerCase();
        return [
            "contact",
            "summary",
            "professional summary",
            "experience",
            "work experience",
            "professional experience",
            "education",
            "academic background",
            "skills",
            "technical skills",
            "core skills",
        ].includes(normalized);
    });
    if (firstSectionIndex <= 0) {
        return text;
    }
    const startIndex = Math.max(0, firstSectionIndex - 4);
    return lines.slice(startIndex).join("\n").trim();
}
function splitResumeSections(text) {
    const lines = text.split("\n");
    const sections = {
        summary: [],
        experience: [],
        education: [],
        skills: [],
    };
    let currentSection = null;
    for (const rawLine of lines) {
        const line = rawLine.trim();
        const heading = normalizeHeading(line);
        if (heading) {
            currentSection = heading;
            continue;
        }
        if (currentSection) {
            sections[currentSection].push(rawLine);
        }
    }
    return {
        summary: sections.summary.join("\n").trim(),
        experience: sections.experience.join("\n").trim(),
        education: sections.education.join("\n").trim(),
        skills: sections.skills.join("\n").trim(),
    };
}
function normalizeHeading(line) {
    const stripped = stripMarkdownDecorations(line)
        .replace(/[:_-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    if (["summary", "professional summary"].includes(stripped)) {
        return "summary";
    }
    if (["experience", "work experience", "professional experience"].includes(stripped)) {
        return "experience";
    }
    if (["education", "academic background"].includes(stripped)) {
        return "education";
    }
    if (["skills", "technical skills", "core skills"].includes(stripped)) {
        return "skills";
    }
    return null;
}
function extractContactLines(text, sections) {
    const boundaries = [sections.summary, sections.experience, sections.education, sections.skills]
        .map((section) => (section ? text.indexOf(section) : -1))
        .filter((index) => index >= 0);
    const endIndex = boundaries.length > 0 ? Math.min(...boundaries) : text.length;
    return text
        .slice(0, endIndex)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}
function parsePersonalDetails(lines, options) {
    const cleanedLines = lines.map((line) => stripMarkdownDecorations(line)).filter(Boolean);
    const fullName = cleanedLines[0] || options.fallbackProfileName;
    const contactHeadingIndex = cleanedLines.findIndex((line) => /^contact$/i.test(line));
    const jobTitleLine = lines.find((line, index) => {
        if (index <= 0) {
            return false;
        }
        const cleaned = stripMarkdownDecorations(line);
        if (/^contact$/i.test(cleaned)) {
            return false;
        }
        if (contactHeadingIndex > 0 &&
            cleanedLines.indexOf(cleaned) >= contactHeadingIndex) {
            return false;
        }
        return (!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(line) &&
            !/linkedin\.com/i.test(line) &&
            !/(\+?\d[\d\s().-]{6,}\d)/.test(line));
    });
    const displayEmail = findFirstMatch(lines, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const phone = findFirstMatch(lines, /(\+?\d[\d\s().-]{6,}\d)/);
    const linkedInRaw = findFirstMatch(lines, /https?:\/\/[^\s]*linkedin\.com\/[^\s)]+/i) ||
        findFirstMatch(lines, /linkedin\.com\/[^\s)]+/i);
    const linkedIn = linkedInRaw ? normalizeUrl(linkedInRaw) : "";
    const locationLine = lines.find((line) => /^location\s*:/i.test(stripMarkdownDecorations(line))) || "";
    const explicitLocation = locationLine
        ? stripMarkdownDecorations(locationLine).replace(/^location\s*:/i, "").trim()
        : "";
    const stripped = lines
        .map((line) => line
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
        .replace(/https?:\/\/[^\s]*linkedin\.com\/[^\s)]+/gi, "")
        .replace(/linkedin\.com\/[^\s)]+/gi, "")
        .replace(/(\+?\d[\d\s().-]{6,}\d)/g, "")
        .replace(/[|•]/g, " ")
        .replace(/\s+/g, " ")
        .trim())
        .filter(Boolean);
    const address = explicitLocation ||
        stripped.find((line) => line !== stripMarkdownDecorations(jobTitleLine || "") &&
            !/^contact$/i.test(line)) ||
        "";
    return {
        fullName,
        jobTitle: stripMarkdownDecorations(jobTitleLine || options.fallbackJobTitle),
        displayEmail,
        phone,
        address,
        website: linkedIn,
        websiteLink: linkedIn,
        linkedIn,
    };
}
function parseSummary(summaryText, fullText) {
    if (summaryText.trim()) {
        return summaryText.trim();
    }
    const blocks = fullText
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
    return blocks[1] || blocks[0] || "";
}
function parseExperience(sectionText) {
    if (!sectionText) {
        return [];
    }
    const entries = [];
    let current = null;
    let currentBullets = [];
    for (const rawLine of sectionText.split("\n")) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const header = parsePipeHeader(line);
        if (header) {
            if (current) {
                current.description = bulletsToHtml(currentBullets);
                entries.push(current);
            }
            const dates = parseDateRange(header.dateRange);
            current = {
                title: header.primary,
                company: header.secondary,
                location: header.location,
                startDateNew: dates.startDateNew,
                endDateNew: dates.endDateNew,
                description: "",
            };
            currentBullets = [];
            continue;
        }
        if (!current) {
            continue;
        }
        if (/^[-*]\s+/.test(line)) {
            currentBullets.push(line.replace(/^[-*]\s+/, "").trim());
            continue;
        }
        if (currentBullets.length > 0) {
            currentBullets[currentBullets.length - 1] =
                `${currentBullets[currentBullets.length - 1]} ${line}`.trim();
        }
        else {
            currentBullets.push(line);
        }
    }
    if (current) {
        current.description = bulletsToHtml(currentBullets);
        entries.push(current);
    }
    return entries;
}
function parseEducation(sectionText) {
    if (!sectionText) {
        return [];
    }
    const entries = sectionText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const parts = stripMarkdownDecorations(line)
            .split("|")
            .map((part) => part.trim())
            .filter(Boolean);
        if (parts.length < 2) {
            return null;
        }
        const degree = parts[0] || "";
        const school = parts[1] || "";
        const trailingParts = parts.slice(2);
        const dateIndex = trailingParts.findIndex((part) => /\b(19|20)\d{2}\b/.test(part) || /present|current/i.test(part));
        const location = dateIndex > 0
            ? trailingParts.slice(0, dateIndex).join(" | ")
            : dateIndex === -1
                ? trailingParts.join(" | ")
                : "";
        const dateRange = dateIndex >= 0 ? trailingParts.slice(dateIndex).join(" | ") : "";
        const dates = parseDateRange(dateRange);
        return {
            degree,
            school,
            location,
            startDateNew: dates.startDateNew,
            endDateNew: dates.endDateNew,
            description: "",
        };
    });
    return entries.filter((entry) => entry !== null);
}
function parseSkills(sectionText) {
    if (!sectionText) {
        return [];
    }
    const entries = [];
    for (const rawLine of sectionText.split("\n")) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        const normalized = line.replace(/^[-*]\s*/, "").trim();
        const categoryMatch = normalized.match(/^\**([^:*]+?)\**:\s*(.+)$/);
        if (categoryMatch) {
            const category = categoryMatch[1].trim();
            const values = categoryMatch[2]
                .split(",")
                .map((part) => part.trim())
                .filter(Boolean);
            for (const value of values) {
                entries.push({
                    skill: value,
                    level: "",
                    infoHtml: `<p>${escapeHtml(category)}</p>`,
                });
            }
            continue;
        }
        entries.push({
            skill: normalized,
            level: "",
            infoHtml: "",
        });
    }
    return entries;
}
function parsePipeHeader(line) {
    const cleaned = line.replace(/\*\*/g, "").trim();
    const parts = cleaned
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length < 2) {
        return null;
    }
    return {
        primary: parts[0] || "",
        secondary: parts[1] || "",
        location: parts[2] || "",
        dateRange: parts.slice(3).join(" | "),
    };
}
function parseDateRange(value) {
    const normalized = value.replace(/[–—]/g, "-").trim();
    if (!normalized) {
        return {};
    }
    const [rawStart, rawEnd] = normalized.split("-").map((part) => part.trim());
    return {
        startDateNew: rawStart ? parsePartialDate(rawStart) : undefined,
        endDateNew: rawEnd && !/present|current/i.test(rawEnd)
            ? parsePartialDate(rawEnd)
            : rawEnd
                ? {
                    year: "",
                    month: "",
                    day: "",
                    hideDay: true,
                    hideMonth: true,
                    present: true,
                }
                : undefined,
    };
}
function parsePartialDate(value) {
    const yearMatch = value.match(/\b(19|20)\d{2}\b/);
    const monthMatch = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
    const monthMap = {
        jan: "1",
        feb: "2",
        mar: "3",
        apr: "4",
        may: "5",
        jun: "6",
        jul: "7",
        aug: "8",
        sep: "9",
        oct: "10",
        nov: "11",
        dec: "12",
    };
    return {
        year: yearMatch?.[0] ?? "",
        month: monthMatch
            ? monthMap[monthMatch[1].slice(0, 3).toLowerCase()] || ""
            : "",
        day: "",
        hideDay: true,
        hideMonth: !monthMatch,
        present: false,
    };
}
function bulletsToHtml(bullets) {
    const normalized = bullets
        .map((bullet) => bullet.replace(/\s+/g, " ").trim())
        .filter(Boolean);
    if (normalized.length === 0) {
        return "";
    }
    return `<ul>${normalized
        .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
        .join("")}</ul>`;
}
function appendHtmlBullet(existingHtml, bullet) {
    const safeBullet = escapeHtml(bullet);
    if (!existingHtml) {
        return `<ul><li>${safeBullet}</li></ul>`;
    }
    if (existingHtml.includes("</ul>")) {
        return existingHtml.replace("</ul>", `<li>${safeBullet}</li></ul>`);
    }
    return `${existingHtml}<ul><li>${safeBullet}</li></ul>`;
}
function findFirstMatch(lines, pattern) {
    for (const line of lines) {
        const match = line.match(pattern);
        if (match?.[0]) {
            return match[0].trim();
        }
    }
    return "";
}
function normalizeUrl(value) {
    return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
function stripMarkdownDecorations(value) {
    return value.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function findSectionIdByType(content, types) {
    for (const [sectionId, section] of Object.entries(content)) {
        const type = (section?.sectionType || sectionId).trim();
        if (types.includes(type)) {
            return sectionId;
        }
    }
    for (const type of types) {
        if (content[type]) {
            return type;
        }
    }
    return "";
}
async function getFlowCvSessionCookie() {
    const envCookie = process.env.FLOWCV_SESSION_COOKIE?.trim();
    if (envCookie) {
        return normalizeFlowCvCookie(envCookie);
    }
    const configPath = getLocalFlowCvConfigPath();
    if (!configPath) {
        return "";
    }
    try {
        const raw = await (0, promises_1.readFile)(configPath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.cookie?.trim()) {
            return normalizeFlowCvCookie(parsed.cookie);
        }
    }
    catch {
        // Ignore missing local FlowCV config.
    }
    return "";
}
function normalizeFlowCvCookie(value) {
    return value.includes("=") ? value : `flowcvsidapp=${value}`;
}
function getLocalFlowCvConfigPath() {
    const userProfile = process.env.USERPROFILE?.trim();
    const home = process.env.HOME?.trim();
    const baseDir = userProfile || home;
    if (!baseDir) {
        return "";
    }
    const normalizedBaseDir = baseDir.replace(/[\\\/]+$/, "");
    return `${normalizedBaseDir}\\.config\\flowcv\\config.json`;
}
async function flowCvApiRequest(endpoint, input) {
    const sessionCookie = await getFlowCvSessionCookie();
    if (!sessionCookie) {
        throw new Error("FlowCV is not configured. Add FLOWCV_SESSION_COOKIE on the server or log in locally through FlowCV MCP.");
    }
    const url = new URL(`${FLOWCV_BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(input?.params ?? {})) {
        url.searchParams.set(key, value);
    }
    const headers = {
        Accept: "application/json",
        Cookie: sessionCookie,
    };
    const method = input?.method ?? "GET";
    const request = {
        method,
        headers,
        redirect: "manual",
    };
    if (input?.body && method !== "GET") {
        headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(input.body);
    }
    const response = await fetch(url, request);
    if (response.status === 302 || response.status === 301) {
        throw new Error("FlowCV session expired. Log in again and retry.");
    }
    let payload;
    try {
        payload = (await response.json());
    }
    catch {
        throw new Error(`FlowCV returned a non-JSON response (${response.status}).`);
    }
    if (!response.ok || !payload.success) {
        throw new Error(normalizeFlowCvErrorMessage(payload.error, response.status));
    }
    return payload;
}
function normalizeFlowCvErrorMessage(rawError, status) {
    const normalized = rawError?.trim() || "";
    const lower = normalized.toLowerCase();
    if (lower.includes("resume_limit_reached")) {
        return "FlowCV resume limit reached. Delete an old resume in FlowCV or upgrade your FlowCV plan, then try again.";
    }
    if (lower.includes("authentication") ||
        lower.includes("invalid_request_error") ||
        lower.includes("session expired")) {
        return "FlowCV authentication failed. Refresh your FlowCV login or session cookie, then try again.";
    }
    if (normalized) {
        return normalized;
    }
    return `FlowCV request failed (${status}).`;
}
async function flowCvBinaryRequest(endpoint, input) {
    const sessionCookie = await getFlowCvSessionCookie();
    if (!sessionCookie) {
        throw new Error("FlowCV is not configured. Add FLOWCV_SESSION_COOKIE on the server or log in locally through FlowCV MCP.");
    }
    const url = new URL(`${FLOWCV_BASE_URL}${endpoint}`);
    for (const [key, value] of Object.entries(input?.params ?? {})) {
        url.searchParams.set(key, value);
    }
    const method = input?.method ?? "GET";
    const headers = {
        Accept: "*/*",
        Cookie: sessionCookie,
    };
    const request = {
        method,
        headers,
        redirect: "manual",
    };
    if (input?.body && method !== "GET") {
        headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(input.body);
    }
    const response = await fetch(url, request);
    if (response.status === 302 || response.status === 301) {
        throw new Error("FlowCV session expired. Log in again and retry.");
    }
    if (!response.ok) {
        throw new Error(`FlowCV PDF download failed (${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    const contentDisposition = response.headers.get("content-disposition");
    const normalizedContentType = contentType?.toLowerCase() ?? "";
    if (normalizedContentType.includes("application/json")) {
        throw createFlowCvBinaryError(buffer, response.status);
    }
    if (!isPdfBuffer(buffer)) {
        throw createFlowCvBinaryError(buffer, response.status);
    }
    return {
        buffer,
        contentType,
        contentDisposition,
    };
}
function isPdfBuffer(buffer) {
    return buffer.subarray(0, 4).toString("utf8") === "%PDF";
}
function createFlowCvBinaryError(buffer, status) {
    const text = buffer.toString("utf8").trim();
    if (text.startsWith("{")) {
        try {
            const payload = JSON.parse(text);
            const message = payload.error || payload.message;
            if (message) {
                return new Error(message);
            }
        }
        catch {
            // Fall through to the generic message below.
        }
    }
    return new Error(`FlowCV PDF download failed (${status}).`);
}
async function waitForFlowCvExport(delayMs) {
    await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
    });
}
