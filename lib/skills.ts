/** Normalize candidate skills and score how well a job post matches them. */

const TECH_LEXICON: Array<{ label: string; aliases: string[] }> = [
  { label: "Angular", aliases: ["angular", "angularjs", "angular.js"] },
  { label: "React", aliases: ["react", "reactjs", "react.js", "next.js", "nextjs"] },
  { label: "Vue", aliases: ["vue", "vuejs", "vue.js", "nuxt"] },
  { label: "Python", aliases: ["python", "django", "flask", "fastapi", "pytorch"] },
  { label: "Django", aliases: ["django"] },
  { label: "Flask", aliases: ["flask"] },
  { label: "FastAPI", aliases: ["fastapi"] },
  { label: "JavaScript", aliases: ["javascript", "ecmascript"] },
  { label: "TypeScript", aliases: ["typescript"] },
  { label: "Node.js", aliases: ["node.js", "nodejs"] },
  { label: "Java", aliases: ["java", "spring boot", "springboot"] },
  { label: ".NET", aliases: [".net", "c#", "asp.net", "dotnet"] },
  { label: "Go", aliases: ["golang"] },
  { label: "PHP", aliases: ["php", "laravel"] },
  { label: "Ruby", aliases: ["ruby on rails", "ruby"] },
  { label: "Kotlin", aliases: ["kotlin"] },
  { label: "Swift", aliases: ["swift"] },
  { label: "AWS", aliases: ["aws", "amazon web services"] },
  { label: "Azure", aliases: ["azure"] },
  { label: "GCP", aliases: ["gcp", "google cloud"] },
  { label: "Data Engineering", aliases: ["data engineer", "data engineering", "etl", "spark", "airflow"] },
  { label: "SQL", aliases: ["postgres", "postgresql", "mysql", "sql"] },
  { label: "MongoDB", aliases: ["mongodb", "mongo"] },
  { label: "DevOps", aliases: ["devops", "kubernetes", "docker", "ci/cd"] },
  { label: "ML", aliases: ["machine learning", "ml engineer", "deep learning"] },
  { label: "AI", aliases: ["ai engineer", "generative ai"] },
  { label: "Firmware", aliases: ["firmware", "firmware engineer", "embedded firmware"] },
  { label: "Embedded", aliases: ["embedded", "embedded systems", "embedded software"] },
  { label: "Hardware", aliases: ["hardware engineer", "hardware design", "pcb", "vlsi", "ece"] }
];

const EXCLUSIVE_FRONTENDS = new Set(["Angular", "React", "Vue"]);
const HARDWARE_STACK = new Set(["Firmware", "Embedded", "Hardware"]);

export function parseSkills(raw: string): string[] {
  return String(raw || "")
    .split(/[,|\n]/)
    .map((skill) => skill.trim())
    .filter(Boolean)
    .filter((skill, index, list) => list.findIndex((item) => item.toLowerCase() === skill.toLowerCase()) === index);
}

function normalizeText(value: string) {
  return ` ${String(value || "").toLowerCase()} `;
}

function findTechsInText(text: string): string[] {
  const haystack = normalizeText(text);
  const found: string[] = [];
  for (const tech of TECH_LEXICON) {
    if (tech.aliases.some((alias) => haystack.includes(` ${alias.toLowerCase()} `) || haystack.includes(alias.toLowerCase()))) {
      found.push(tech.label);
    }
  }
  return Array.from(new Set(found));
}

function candidateOwnsTech(candidateSkills: string[], techLabel: string): boolean {
  const entry = TECH_LEXICON.find((tech) => tech.label === techLabel);
  if (!entry) return false;
  const skillBlob = normalizeText(candidateSkills.join(" , "));
  return entry.aliases.some((alias) => skillBlob.includes(alias.toLowerCase()))
    || candidateSkills.some((skill) => skill.toLowerCase() === techLabel.toLowerCase());
}

export type SkillFit = {
  ok: boolean;
  score: number;
  matchedSkills: string[];
  postTechs: string[];
  missingExclusive: string[];
  reason: string;
};

/**
 * Decide whether the candidate should apply to this post based on skill overlap.
 * Skips roles whose exclusive stack (e.g. Angular) is required but not owned.
 */
export function evaluateSkillFit(topSkills: string, postContent: string): SkillFit {
  const candidateSkills = parseSkills(topSkills);
  const postTechs = findTechsInText(postContent);
  const postLower = normalizeText(postContent);

  const matchedSkills = candidateSkills.filter((skill) => {
    const skillTechs = findTechsInText(skill);
    if (skillTechs.some((tech) => postTechs.includes(tech))) return true;
    return postLower.includes(skill.toLowerCase());
  });

  const postExclusive = postTechs.filter((tech) => EXCLUSIVE_FRONTENDS.has(tech));
  const ownedExclusive = postExclusive.filter((tech) => candidateOwnsTech(candidateSkills, tech));
  const missingExclusive = postExclusive.filter((tech) => !candidateOwnsTech(candidateSkills, tech));

  // Angular/React/Vue-centric posts require ownership of at least one mentioned exclusive frontend.
  if (postExclusive.length > 0 && ownedExclusive.length === 0) {
    return {
      ok: false,
      score: 0,
      matchedSkills,
      postTechs,
      missingExclusive,
      reason: `Post requires ${postExclusive.join("/")}, which is not in your skills.`
    };
  }

  const postHardware = postTechs.filter((tech) => HARDWARE_STACK.has(tech));
  const ownsHardware = postHardware.some((tech) => candidateOwnsTech(candidateSkills, tech));
  if (postHardware.length > 0 && !ownsHardware) {
    return {
      ok: false,
      score: 0,
      matchedSkills,
      postTechs,
      missingExclusive,
      reason: `Post is ${postHardware.join("/")} focused, which is not in your skills.`
    };
  }

  const score = matchedSkills.length;
  if (postTechs.length > 0 && score === 0) {
    return {
      ok: false,
      score: 0,
      matchedSkills,
      postTechs,
      missingExclusive,
      reason: `No overlap between your skills and the post technologies (${postTechs.join(", ")}).`
    };
  }

  return {
    ok: true,
    score: Math.max(score, postTechs.length === 0 ? 1 : score),
    matchedSkills,
    postTechs,
    missingExclusive,
    reason: score > 0 ? `Matched skills: ${matchedSkills.join(", ")}` : "General role with no conflicting tech stack."
  };
}
