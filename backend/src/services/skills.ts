/**
 * Normalized skill extraction.
 *
 * Deterministic text scanning against a canonical skill catalog with an
 * alias map (React.js / ReactJS -> React, Node.js / NodeJS -> Node, etc.).
 * No LLM required for detection — AI is only used later for semantic
 * interpretation where appropriate.
 */

export type SkillCategory =
  | 'Programming'
  | 'Frontend'
  | 'Backend'
  | 'Database'
  | 'Cloud'
  | 'AI/ML'
  | 'DevOps'
  | 'Testing'
  | 'Tools'
  | 'Data'
  | 'Mobile'
  | 'Blockchain'
  | 'Security'
  | 'Networking'
  | 'Design'
  | 'Soft Skills';

export interface ExtractedSkill {
  skill: string;
  category: SkillCategory;
  confidence: number;
  source: string;
}

export interface CatalogEntry {
  skill: string;
  category: SkillCategory;
  /** All textual variants that map to this canonical skill (lowercased). */
  aliases: string[];
}

export const SKILL_CATALOG: CatalogEntry[] = [
  // ── Programming languages ──────────────────────────────
  { skill: 'JavaScript', category: 'Programming', aliases: ['javascript', 'js', 'ecmascript', 'es6', 'es2015'] },
  { skill: 'TypeScript', category: 'Programming', aliases: ['typescript', 'ts'] },
  { skill: 'Python', category: 'Programming', aliases: ['python', 'python3'] },
  { skill: 'Java', category: 'Programming', aliases: ['java', 'core java'] },
  { skill: 'C', category: 'Programming', aliases: ['c programming', 'ansi c'] },
  { skill: 'C++', category: 'Programming', aliases: ['c++', 'cpp', 'c plus plus'] },
  { skill: 'C#', category: 'Programming', aliases: ['c#', 'c sharp', 'csharp'] },
  { skill: 'Go', category: 'Programming', aliases: ['golang', 'go lang'] },
  { skill: 'Rust', category: 'Programming', aliases: ['rust'] },
  { skill: 'Ruby', category: 'Programming', aliases: ['ruby'] },
  { skill: 'PHP', category: 'Programming', aliases: ['php'] },
  { skill: 'Kotlin', category: 'Programming', aliases: ['kotlin'] },
  { skill: 'Swift', category: 'Programming', aliases: ['swift'] },
  { skill: 'Scala', category: 'Programming', aliases: ['scala'] },
  { skill: 'R', category: 'Programming', aliases: ['r language', 'r programming'] },
  { skill: 'SQL', category: 'Database', aliases: ['sql', 'structured query language'] },
  { skill: 'Bash', category: 'Tools', aliases: ['bash', 'shell script', 'shell scripting', 'posix'] },
  { skill: 'PowerShell', category: 'Tools', aliases: ['powershell'] },
  { skill: 'Groovy', category: 'Programming', aliases: ['groovy'] },
  { skill: 'Dart', category: 'Programming', aliases: ['dart'] },
  { skill: 'MATLAB', category: 'Programming', aliases: ['matlab'] },
  { skill: 'HTML', category: 'Frontend', aliases: ['html', 'html5'] },
  { skill: 'CSS', category: 'Frontend', aliases: ['css', 'css3'] },

  // ── Frontend ───────────────────────────────────────────
  { skill: 'React', category: 'Frontend', aliases: ['react', 'reactjs', 'react.js', 'react native web'] },
  { skill: 'React Native', category: 'Mobile', aliases: ['react native'] },
  { skill: 'Vue', category: 'Frontend', aliases: ['vue', 'vuejs', 'vue.js', 'nuxt', 'nuxtjs'] },
  { skill: 'Angular', category: 'Frontend', aliases: ['angular', 'angularjs', 'ng2', 'angular 2'] },
  { skill: 'Svelte', category: 'Frontend', aliases: ['svelte'] },
  { skill: 'Next.js', category: 'Frontend', aliases: ['nextjs', 'next.js', 'next js'] },
  { skill: 'Redux', category: 'Frontend', aliases: ['redux'] },
  { skill: 'Zustand', category: 'Frontend', aliases: ['zustand'] },
  { skill: 'Tailwind CSS', category: 'Frontend', aliases: ['tailwind', 'tailwindcss', 'tailwind css'] },
  { skill: 'Bootstrap', category: 'Frontend', aliases: ['bootstrap'] },
  { skill: 'Material UI', category: 'Frontend', aliases: ['material ui', 'mui', 'material-ui'] },
  { skill: 'jQuery', category: 'Frontend', aliases: ['jquery'] },
  { skill: 'Webpack', category: 'Frontend', aliases: ['webpack'] },
  { skill: 'Vite', category: 'Tools', aliases: ['vite', 'vitejs'] },
  { skill: 'SCSS', category: 'Frontend', aliases: ['scss', 'sass'] },
  { skill: 'Styled Components', category: 'Frontend', aliases: ['styled-components', 'styled components'] },
  { skill: 'Framer Motion', category: 'Frontend', aliases: ['framer motion', 'framer-motion'] },
  { skill: 'Three.js', category: 'Frontend', aliases: ['three.js', 'threejs'] },
  { skill: 'D3.js', category: 'Frontend', aliases: ['d3', 'd3.js'] },
  { skill: 'WebRTC', category: 'Frontend', aliases: ['webrtc'] },

  // ── Backend ────────────────────────────────────────────
  { skill: 'Node.js', category: 'Backend', aliases: ['node', 'nodejs', 'node.js', 'node js'] },
  { skill: 'Express', category: 'Backend', aliases: ['express', 'expressjs', 'express.js'] },
  { skill: 'NestJS', category: 'Backend', aliases: ['nestjs', 'nest.js'] },
  { skill: 'Spring', category: 'Backend', aliases: ['spring', 'spring boot', 'springboot'] },
  { skill: 'Django', category: 'Backend', aliases: ['django'] },
  { skill: 'Flask', category: 'Backend', aliases: ['flask'] },
  { skill: 'FastAPI', category: 'Backend', aliases: ['fastapi', 'fast api'] },
  { skill: 'Ruby on Rails', category: 'Backend', aliases: ['rails', 'ruby on rails'] },
  { skill: 'Laravel', category: 'Backend', aliases: ['laravel'] },
  { skill: 'ASP.NET', category: 'Backend', aliases: ['asp.net', 'aspnet', '.net core', 'dotnet', '.net'] },
  { skill: 'GraphQL', category: 'Backend', aliases: ['graphql', 'apollo'] },
  { skill: 'REST API', category: 'Backend', aliases: ['rest api', 'restful api', 'restful apis', 'rest apis', 'restful services', 'rest'] },
  { skill: 'Socket.IO', category: 'Backend', aliases: ['socket.io', 'socketio', 'websocket', 'websockets'] },
  { skill: 'gRPC', category: 'Backend', aliases: ['grpc'] },
  { skill: 'Redis', category: 'Database', aliases: ['redis'] },
  { skill: 'RabbitMQ', category: 'Backend', aliases: ['rabbitmq', 'rabbit mq'] },
  { skill: 'Kafka', category: 'Backend', aliases: ['kafka', 'apache kafka'] },
  { skill: 'Celery', category: 'Backend', aliases: ['celery'] },
  { skill: 'Microservices', category: 'Backend', aliases: ['microservices', 'micro-service', 'micro service'] },

  // ── Databases ──────────────────────────────────────────
  { skill: 'PostgreSQL', category: 'Database', aliases: ['postgresql', 'postgres'] },
  { skill: 'MySQL', category: 'Database', aliases: ['mysql', 'my-sql'] },
  { skill: 'MongoDB', category: 'Database', aliases: ['mongodb', 'mongo'] },
  { skill: 'SQLite', category: 'Database', aliases: ['sqlite'] },
  { skill: 'Supabase', category: 'Database', aliases: ['supabase'] },
  { skill: 'Firebase', category: 'Database', aliases: ['firebase', 'firestore'] },
  { skill: 'Oracle DB', category: 'Database', aliases: ['oracle', 'oracle db', 'pl/sql', 'plsql'] },
  { skill: 'MS SQL Server', category: 'Database', aliases: ['sql server', 'mssql', 'ms sql'] },
  { skill: 'DynamoDB', category: 'Database', aliases: ['dynamodb', 'dynamo db'] },
  { skill: 'Elasticsearch', category: 'Database', aliases: ['elasticsearch', 'elastic search'] },
  { skill: 'Neo4j', category: 'Database', aliases: ['neo4j'] },
  { skill: 'Cassandra', category: 'Database', aliases: ['cassandra'] },
  { skill: 'Prisma', category: 'Database', aliases: ['prisma', 'prisma orm'] },
  { skill: 'TypeORM', category: 'Database', aliases: ['typeorm'] },
  { skill: 'Sequelize', category: 'Database', aliases: ['sequelize'] },
  { skill: 'Mongoose', category: 'Database', aliases: ['mongoose'] },

  // ── Cloud / DevOps / Infra ─────────────────────────────
  { skill: 'AWS', category: 'Cloud', aliases: ['aws', 'amazon web services', 'amazon aws'] },
  { skill: 'Azure', category: 'Cloud', aliases: ['azure', 'microsoft azure'] },
  { skill: 'Google Cloud', category: 'Cloud', aliases: ['gcp', 'google cloud', 'google cloud platform'] },
  { skill: 'Docker', category: 'DevOps', aliases: ['docker', 'docker compose', 'docker-compose'] },
  { skill: 'Kubernetes', category: 'DevOps', aliases: ['kubernetes', 'k8s'] },
  { skill: 'Terraform', category: 'DevOps', aliases: ['terraform'] },
  { skill: 'Ansible', category: 'DevOps', aliases: ['ansible'] },
  { skill: 'Jenkins', category: 'DevOps', aliases: ['jenkins'] },
  { skill: 'GitHub Actions', category: 'DevOps', aliases: ['github actions', 'github ci/cd'] },
  { skill: 'GitLab CI', category: 'DevOps', aliases: ['gitlab ci', 'gitlab ci/cd'] },
  { skill: 'CI/CD', category: 'DevOps', aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment'] },
  { skill: 'Nginx', category: 'DevOps', aliases: ['nginx'] },
  { skill: 'Vercel', category: 'DevOps', aliases: ['vercel'] },
  { skill: 'Netlify', category: 'DevOps', aliases: ['netlify'] },
  { skill: 'Render', category: 'DevOps', aliases: ['render'] },
  { skill: 'Heroku', category: 'DevOps', aliases: ['heroku'] },
  { skill: 'Serverless', category: 'Cloud', aliases: ['serverless', 'lambda', 'aws lambda', 'azure functions'] },
  { skill: 'S3', category: 'Cloud', aliases: ['s3', 'amazon s3'] },
  { skill: 'EC2', category: 'Cloud', aliases: ['ec2', 'amazon ec2'] },

  // ── AI / ML / Data ─────────────────────────────────────
  { skill: 'Machine Learning', category: 'AI/ML', aliases: ['machine learning', 'ml'] },
  { skill: 'Deep Learning', category: 'AI/ML', aliases: ['deep learning'] },
  { skill: 'TensorFlow', category: 'AI/ML', aliases: ['tensorflow', 'tf'] },
  { skill: 'PyTorch', category: 'AI/ML', aliases: ['pytorch'] },
  { skill: 'Keras', category: 'AI/ML', aliases: ['keras'] },
  { skill: 'Scikit-learn', category: 'AI/ML', aliases: ['scikit-learn', 'sklearn', 'scikit learn'] },
  { skill: 'Pandas', category: 'Data', aliases: ['pandas'] },
  { skill: 'NumPy', category: 'Data', aliases: ['numpy'] },
  { skill: 'Natural Language Processing', category: 'AI/ML', aliases: ['nlp', 'natural language processing'] },
  { skill: 'Computer Vision', category: 'AI/ML', aliases: ['computer vision', 'opencv'] },
  { skill: 'Generative AI', category: 'AI/ML', aliases: ['generative ai', 'genai', 'llm', 'large language model', 'large language models', 'llms', 'rag'] },
  { skill: 'OpenAI', category: 'AI/ML', aliases: ['openai', 'open ai', 'gpt', 'chatgpt', 'gpt-4', 'gpt-3.5', 'gpt-4o'] },
  { skill: 'LangChain', category: 'AI/ML', aliases: ['langchain'] },
  { skill: 'LangGraph', category: 'AI/ML', aliases: ['langgraph'] },
  { skill: 'Hugging Face', category: 'AI/ML', aliases: ['hugging face', 'huggingface', 'transformers'] },
  { skill: 'Data Analysis', category: 'Data', aliases: ['data analysis', 'data analytics'] },
  { skill: 'Data Visualization', category: 'Data', aliases: ['data visualization', 'tableau', 'power bi'] },
  { skill: 'ETL', category: 'Data', aliases: ['etl', 'airflow', 'apache airflow'] },
  { skill: 'Spark', category: 'Data', aliases: ['apache spark', 'spark'] },
  { skill: 'Jupyter', category: 'Data', aliases: ['jupyter', 'jupyter notebook'] },

  // ── Testing ────────────────────────────────────────────
  { skill: 'Jest', category: 'Testing', aliases: ['jest'] },
  { skill: 'Vitest', category: 'Testing', aliases: ['vitest'] },
  { skill: 'Mocha', category: 'Testing', aliases: ['mocha'] },
  { skill: 'Chai', category: 'Testing', aliases: ['chai'] },
  { skill: 'JUnit', category: 'Testing', aliases: ['junit'] },
  { skill: 'pytest', category: 'Testing', aliases: ['pytest', 'py.test'] },
  { skill: 'Cypress', category: 'Testing', aliases: ['cypress'] },
  { skill: 'Playwright', category: 'Testing', aliases: ['playwright'] },
  { skill: 'Selenium', category: 'Testing', aliases: ['selenium'] },
  { skill: 'Test-Driven Development', category: 'Testing', aliases: ['tdd', 'test driven development'] },
  { skill: 'Unit Testing', category: 'Testing', aliases: ['unit testing', 'unit tests'] },

  // ── Tools ──────────────────────────────────────────────
  { skill: 'Git', category: 'Tools', aliases: ['git', 'github', 'gitlab', 'bitbucket'] },
  { skill: 'Jira', category: 'Tools', aliases: ['jira'] },
  { skill: 'Agile', category: 'Tools', aliases: ['agile', 'scrum', 'kanban'] },
  { skill: 'Postman', category: 'Tools', aliases: ['postman'] },
  { skill: 'Swagger', category: 'Tools', aliases: ['swagger', 'openapi'] },
  { skill: 'Linux', category: 'Tools', aliases: ['linux', 'ubuntu', 'debian'] },
  { skill: 'Gradle', category: 'Tools', aliases: ['gradle'] },
  { skill: 'Maven', category: 'Tools', aliases: ['maven'] },
  { skill: 'npm', category: 'Tools', aliases: ['npm', 'node package manager', 'yarn', 'pnpm'] },
  { skill: 'Babel', category: 'Tools', aliases: ['babel'] },
  { skill: 'ESLint', category: 'Tools', aliases: ['eslint'] },
  { skill: 'Prettier', category: 'Tools', aliases: ['prettier'] },

  // ── Mobile ─────────────────────────────────────────────
  { skill: 'Android', category: 'Mobile', aliases: ['android', 'android studio', 'android sdk'] },
  { skill: 'iOS', category: 'Mobile', aliases: ['ios'] },
  { skill: 'Flutter', category: 'Mobile', aliases: ['flutter'] },
  { skill: 'SwiftUI', category: 'Mobile', aliases: ['swiftui'] },

  // ── Blockchain ─────────────────────────────────────────
  { skill: 'Blockchain', category: 'Blockchain', aliases: ['blockchain', 'ethereum', 'solidity', 'smart contract', 'smart contracts', 'web3', 'solana', 'hyperledger'] },

  // ── Security / Networking ──────────────────────────────
  { skill: 'Authentication', category: 'Security', aliases: ['authentication', 'auth', 'oauth', 'oauth2', 'jwt', 'sso', 'single sign-on', 'saml'] },
  { skill: 'Authorization', category: 'Security', aliases: ['authorization', 'rbac', 'role based access'] },
  { skill: 'Cybersecurity', category: 'Security', aliases: ['cybersecurity', 'cyber security', 'penetration testing', 'owasp'] },
  { skill: 'Encryption', category: 'Security', aliases: ['encryption', 'cryptography', 'aes', 'rsa', 'ssl/tls', 'tls'] },
  { skill: 'Networking', category: 'Networking', aliases: ['networking', 'tcp/ip', 'http', 'https', 'dns', 'load balancing', 'cdn'] },

  // ── Soft skills ────────────────────────────────────────
  { skill: 'Leadership', category: 'Soft Skills', aliases: ['leadership', 'leading a team', 'team lead'] },
  { skill: 'Communication', category: 'Soft Skills', aliases: ['communication', 'communicating', 'presentation', 'presentations'] },
  { skill: 'Teamwork', category: 'Soft Skills', aliases: ['teamwork', 'team player', 'collaboration', 'collaborative'] },
  { skill: 'Problem Solving', category: 'Soft Skills', aliases: ['problem solving', 'problem-solving', 'troubleshooting'] },
  { skill: 'Time Management', category: 'Soft Skills', aliases: ['time management'] },
  { skill: 'Adaptability', category: 'Soft Skills', aliases: ['adaptability', 'adaptable', 'flexible'] },
  { skill: 'Mentoring', category: 'Soft Skills', aliases: ['mentoring', 'mentor', 'coaching', 'mentorship'] },
  { skill: 'Critical Thinking', category: 'Soft Skills', aliases: ['critical thinking', 'analytical thinking'] },
  { skill: 'Ownership', category: 'Soft Skills', aliases: ['ownership', 'take ownership'] },
];

// Precompiled matchers: alias (lowercased) -> catalog entry index.
interface CompiledAlias {
  alias: string;
  regex: RegExp;
  exact: RegExp;
  entry: CatalogEntry;
}

const compiled: CompiledAlias[] = SKILL_CATALOG.flatMap((entry) =>
  [...new Set(entry.aliases.map((a) => a.toLowerCase()))].map((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      alias,
      regex: new RegExp(`\\b${escaped}\\b`, 'i'),
      exact: new RegExp(`^${escaped}$`, 'i'),
      entry,
    };
  }),
);

// Longest alias wins so generic aliases ("js") never shadow more specific
// ones ("react.js" must resolve to React, not JavaScript).
const compiledLongestFirst: CompiledAlias[] = compiled
  .slice()
  .sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize a raw term so aliases collapse onto canonical names. */
export function normalizeSkill(term: string): string | null {
  const raw = term.trim().toLowerCase().replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  for (const c of compiledLongestFirst) {
    if (c.exact.test(raw) || c.regex.test(raw)) return c.entry.skill;
  }
  // Second pass with punctuation stripped (REST-API -> "rest api") for terms
  // that no dotted/hyphenated alias matches verbatim. Never shadows the first
  // pass, which keeps React.js -> React (not JavaScript).
  const flattened = raw.replace(/[.,\-#]/g, ' ').replace(/\s+/g, ' ').trim();
  if (flattened && flattened !== raw) {
    for (const c of compiledLongestFirst) {
      if (c.exact.test(flattened) || c.regex.test(flattened)) return c.entry.skill;
    }
  }
  return null;
}

/** Detect which catalog skills are present in a block of text. */
export function extractSkills(text: string, source: string): ExtractedSkill[] {
  const found = new Map<string, ExtractedSkill>();
  // Collect every alias match across the text, then accept longest-first so
  // overlapping generic aliases ("js" inside "React.js") don't win.
  const spans: Array<{ start: number; end: number; len: number; entry: CatalogEntry }> = [];
  for (const c of compiled) {
    const re = new RegExp(c.regex.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      spans.push({ start: m.index, end: m.index + m[0].length, len: m[0].length, entry: c.entry });
    }
  }
  spans.sort((a, b) => b.len - a.len || a.start - b.start);
  const accepted: Array<{ start: number; end: number; entry: CatalogEntry }> = [];
  for (const s of spans) {
    if (accepted.some((a) => a.start <= s.end && s.start <= a.end)) continue;
    accepted.push({ start: s.start, end: s.end, entry: s.entry });
    const matchedText = text.slice(s.start, s.end);
    // Confidence: whole-token match on the alias wins; a match inside a larger
    // token (blocked for word chars by \b anyway) is weighted lower.
    const wholeWord = new RegExp(`(^|[^a-z0-9])${escapeRegExp(matchedText.toLowerCase())}($|[^a-z0-9])`, 'i').test(text);
    const prev = found.get(s.entry.skill);
    const confidence = wholeWord ? 0.98 : 0.9;
    if (!prev || prev.confidence < confidence) {
      found.set(s.entry.skill, { skill: s.entry.skill, category: s.entry.category, confidence, source });
    }
  }
  return Array.from(found.values()).sort((a, b) => b.confidence - a.confidence);
}

/** Normalize skills across resume/JD lists into canonical names (deduped). */
export function normalizeSkillList(skills: string[]): string[] {
  const out: string[] = [];
  for (const s of skills) {
    const n = normalizeSkill(s);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Known aliases for a canonical skill (used by match reporting). */
export function getSkillCategory(skill: string): SkillCategory | null {
  const e = SKILL_CATALOG.find((c) => c.skill.toLowerCase() === skill.toLowerCase());
  return e ? e.category : null;
}

/**
 * Curated semantic relations for PARTIAL matches: related-but-distinct
 * canonical skills. A resume skill in this set partially satisfies a JD
 * skill of the same key (the match engine awards half credit for these).
 *
 * Deliberately conservative — the catalog aliases already handle exact
 * normalization (React.js -> React, Node.js -> Node, REST API -> RESTful
 * APIs). Skills with different paradigms (e.g. Python vs Java, MongoDB vs
 * MySQL) are intentionally NOT related. Keys are lowercase canonical names.
 */
const RELATED_SKILLS: Record<string, string[]> = {
  // Relational database family — "SQL" experience carries across engines.
  'sql': ['mysql', 'postgresql', 'sqlite', 'ms sql server', 'oracle db'],
  'mysql': ['sql', 'postgresql', 'sqlite', 'ms sql server', 'oracle db'],
  'postgresql': ['sql', 'mysql', 'sqlite', 'ms sql server', 'oracle db'],
  'sqlite': ['sql', 'mysql', 'postgresql'],
  'ms sql server': ['sql', 'mysql', 'postgresql', 'oracle db'],
  'oracle db': ['sql', 'mysql', 'postgresql', 'ms sql server'],
  // NoSQL document family.
  'mongodb': ['dynamodb', 'cassandra', 'firebase'],
  'dynamodb': ['mongodb', 'cassandra'],
  'cassandra': ['mongodb', 'dynamodb'],
  // Cloud platforms — transferable infrastructure skills.
  'aws': ['azure', 'google cloud'],
  'azure': ['aws', 'google cloud'],
  'google cloud': ['aws', 'azure'],
  // JS test frameworks.
  'jest': ['vitest', 'mocha', 'chai'],
  'vitest': ['jest', 'mocha'],
  'mocha': ['jest', 'vitest', 'chai'],
  // React vs React Native (shared component model, different target).
  'react': ['react native'],
  'react native': ['react'],
};

/** Whether two canonical skills are related-but-distinct (partial match). */
export function areRelatedSkills(a: string, b: string): boolean {
  const A = a.trim().toLowerCase();
  const B = b.trim().toLowerCase();
  if (!A || !B || A === B) return false;
  const related = RELATED_SKILLS[A] || [];
  return related.includes(B);
}
