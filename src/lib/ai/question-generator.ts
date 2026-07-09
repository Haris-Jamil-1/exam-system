import type { GeneratedQuestion, QuestionType } from '@/types';

interface GenerateInput {
  text: string;
  count: number;
  difficulty: 'easy' | 'medium' | 'hard';
  type: QuestionType;
  // Resolved CLO text (not the ID) — the API route resolves learningObjectiveId -> text before
  // calling in here, matching where a real prompt-construction step would inject it too.
  cloText?: string;
}

// Phase 3: replace this body with a real Claude API call using @anthropic-ai/sdk
// import Anthropic from '@anthropic-ai/sdk';
// const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// model: 'claude-sonnet-4-6', structured outputs, parse question JSON from response

export function generateQuestions(input: GenerateInput): GeneratedQuestion[] {
  const { difficulty, type } = input;
  const m = (easy: number, med: number, hard: number) =>
    difficulty === 'easy' ? easy : difficulty === 'medium' ? med : hard;

  const mockMcq: GeneratedQuestion[] = [
    {
      stem: 'Based on the provided material, what is the primary function described?',
      type: 'mcq',
      options: [
        'To initialize the system and allocate resources',
        'To process input data and return results',
        'To manage communication between components',
        'To store and retrieve information efficiently',
      ],
      correctAnswer: 'To process input data and return results',
      difficulty,
      explanation: 'This is the core purpose outlined in the source material.',
      marks: m(2, 4, 6),
    },
    {
      stem: 'Which concept from the material is most directly associated with optimization?',
      type: 'mcq',
      options: [
        'Data normalization',
        'Algorithmic complexity reduction',
        'Interface abstraction',
        'State persistence',
      ],
      correctAnswer: 'Algorithmic complexity reduction',
      difficulty,
      marks: m(2, 4, 6),
    },
    {
      stem: 'According to the text, what is the recommended approach for handling edge cases?',
      type: 'mcq',
      options: [
        'Ignore them in initial implementation',
        'Address them with explicit validation and fallback logic',
        'Delegate to external libraries only',
        'Document them without implementation',
      ],
      correctAnswer: 'Address them with explicit validation and fallback logic',
      difficulty,
      marks: m(2, 4, 6),
    },
    {
      stem: 'What distinguishes the approach described in the document from traditional methods?',
      type: 'mcq',
      options: [
        'Lower resource consumption at rest',
        'Dynamic adaptation based on runtime conditions',
        'Simplified single-threaded execution',
        'Elimination of external dependencies',
      ],
      correctAnswer: 'Dynamic adaptation based on runtime conditions',
      difficulty,
      marks: m(2, 4, 6),
    },
    {
      stem: 'Which limitation is explicitly acknowledged in the material?',
      type: 'mcq',
      options: [
        'Scalability challenges under high concurrency',
        'Lack of cross-platform compatibility',
        'Inability to handle structured data',
        'Dependency on proprietary tools',
      ],
      correctAnswer: 'Scalability challenges under high concurrency',
      difficulty,
      marks: m(2, 4, 6),
    },
  ];

  const mockMrq: GeneratedQuestion[] = [
    {
      stem: 'Which of the following statements from the material are accurate? (Select all that apply)',
      type: 'mrq',
      options: [
        'The approach supports horizontal scaling',
        'It requires synchronous processing only',
        'It integrates with existing systems',
        'It reduces operational overhead',
      ],
      correctAnswer: ['The approach supports horizontal scaling', 'It integrates with existing systems', 'It reduces operational overhead'],
      difficulty,
      marks: m(4, 6, 8),
    },
    {
      stem: 'Which components are mentioned as essential in the document? (Select all that apply)',
      type: 'mrq',
      options: [
        'Input validation layer',
        'External monitoring service',
        'Core processing engine',
        'Output serialization module',
      ],
      correctAnswer: ['Input validation layer', 'Core processing engine', 'Output serialization module'],
      difficulty,
      marks: m(4, 6, 8),
    },
    {
      stem: 'Which best practices are recommended in the text? (Select all that apply)',
      type: 'mrq',
      options: [
        'Avoid premature optimization',
        'Use global state extensively',
        'Write testable, modular code',
        'Document public interfaces',
      ],
      correctAnswer: ['Avoid premature optimization', 'Write testable, modular code', 'Document public interfaces'],
      difficulty,
      marks: m(4, 6, 8),
    },
    {
      stem: 'Which of the following trade-offs does the author acknowledge? (Select all that apply)',
      type: 'mrq',
      options: [
        'Increased memory usage for better speed',
        'Reduced flexibility for simpler maintenance',
        'Higher cost for greater reliability',
        'No trade-offs exist in the described approach',
      ],
      correctAnswer: ['Increased memory usage for better speed', 'Reduced flexibility for simpler maintenance', 'Higher cost for greater reliability'],
      difficulty,
      marks: m(4, 6, 8),
    },
    {
      stem: 'Which scenarios are suitable for the described methodology? (Select all that apply)',
      type: 'mrq',
      options: [
        'High-throughput batch processing',
        'Real-time event streaming',
        'Simple single-user scripts',
        'Distributed multi-tenant systems',
      ],
      correctAnswer: ['High-throughput batch processing', 'Real-time event streaming', 'Distributed multi-tenant systems'],
      difficulty,
      marks: m(4, 6, 8),
    },
  ];

  const mockTrueFalse: GeneratedQuestion[] = [
    {
      stem: 'The primary concept described in the material was developed before the year 2000.',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'False',
      difficulty,
      marks: 2,
    },
    {
      stem: 'The methodology presented in the document requires additional third-party tools to function.',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'True',
      difficulty,
      marks: 2,
    },
    {
      stem: 'According to the text, the described approach guarantees O(1) performance in all scenarios.',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'False',
      difficulty,
      marks: 2,
    },
    {
      stem: 'The document states that the main limitation can be overcome with proper configuration.',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'True',
      difficulty,
      marks: 2,
    },
    {
      stem: 'All examples mentioned in the material involve distributed systems.',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'False',
      difficulty,
      marks: 2,
    },
  ];

  const mockShortAnswer: GeneratedQuestion[] = [
    {
      stem: 'Define the key term introduced in the first section of the material.',
      type: 'short_answer',
      correctAnswer: 'The term refers to a structured approach to problem decomposition.',
      difficulty,
      marks: 3,
    },
    {
      stem: 'What are the three main steps described in the document?',
      type: 'short_answer',
      correctAnswer: 'Analysis, Implementation, Validation',
      difficulty,
      marks: 5,
    },
    {
      stem: 'State the formula or rule mentioned for calculating the primary metric.',
      type: 'short_answer',
      correctAnswer: 'Result = Input × Coefficient / Baseline',
      difficulty,
      marks: 4,
    },
    {
      stem: 'Identify the prerequisite condition stated in the material.',
      type: 'short_answer',
      correctAnswer: 'System must be initialized before processing begins.',
      difficulty,
      marks: 3,
    },
    {
      stem: 'What does the author recommend as the final step in the process?',
      type: 'short_answer',
      correctAnswer: 'Validation and iterative refinement based on feedback.',
      difficulty,
      marks: 4,
    },
  ];

  const mockEssay: GeneratedQuestion[] = [
    {
      stem: 'Analyze the key concepts presented in the material and discuss their practical implications. Provide concrete examples.',
      type: 'essay',
      correctAnswer: 'See rubric',
      difficulty,
      marks: 20,
    },
    {
      stem: 'Compare and contrast the approaches described in the document. When would you choose one over the other?',
      type: 'essay',
      correctAnswer: 'See rubric',
      difficulty,
      marks: 25,
    },
    {
      stem: 'Critically evaluate the methodology described in the text. What are its strengths and weaknesses?',
      type: 'essay',
      correctAnswer: 'See rubric',
      difficulty,
      marks: 20,
    },
    {
      stem: 'Based on the material, propose an improved solution to the central problem discussed. Justify your proposal.',
      type: 'essay',
      correctAnswer: 'See rubric',
      difficulty,
      marks: 30,
    },
    {
      stem: 'Explain how the principles from the document could be applied in a real-world scenario of your choice.',
      type: 'essay',
      correctAnswer: 'See rubric',
      difficulty,
      marks: 20,
    },
  ];

  const mockFillBlank: GeneratedQuestion[] = [
    {
      stem: 'The process described in the document is primarily used to ___ the input data before it reaches the core system.',
      type: 'fill_blank',
      correctAnswer: 'transform',
      difficulty,
      marks: 3,
    },
    {
      stem: 'According to the material, the recommended design pattern for this use case is the ___ pattern.',
      type: 'fill_blank',
      correctAnswer: 'observer',
      difficulty,
      marks: 3,
    },
    {
      stem: 'The document states that a ___ of at least 99.9% is required for production deployments.',
      type: 'fill_blank',
      correctAnswer: 'uptime',
      difficulty,
      marks: 3,
    },
    {
      stem: 'When processing fails, the system must ___ to a known good state automatically.',
      type: 'fill_blank',
      correctAnswer: 'rollback',
      difficulty,
      marks: 3,
    },
    {
      stem: 'The key metric described in the final section is referred to as ___ efficiency.',
      type: 'fill_blank',
      correctAnswer: 'operational',
      difficulty,
      marks: 3,
    },
  ];

  // New matching format: options = left-side terms only; correctAnswer = ordered right-side labels.
  // options[i] pairs with correctAnswer[i]. Students see right labels shuffled and must map them.
  const mockMatching: GeneratedQuestion[] = [
    {
      stem: 'Match each term from the material with its correct definition:',
      type: 'matching',
      options: ['Initialization', 'Processing', 'Persistence', 'Validation'],
      correctAnswer: [
        'Setting up the system prior to first use',
        'Transforming input data into desired output',
        'Storing state across multiple sessions',
        'Verifying correctness of input or output',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Match each phase of the described lifecycle to its primary goal:',
      type: 'matching',
      options: ['Analysis', 'Design', 'Implementation', 'Deployment'],
      correctAnswer: [
        'Understanding requirements and constraints',
        'Architecting the solution structure',
        'Writing and testing code',
        'Releasing to production environment',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Match each concept with the layer of the architecture it belongs to:',
      type: 'matching',
      options: ['Authentication', 'Routing', 'Caching', 'Logging'],
      correctAnswer: ['Security layer', 'Network layer', 'Performance layer', 'Observability layer'],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Match each error type with its cause:',
      type: 'matching',
      options: ['Timeout error', 'Validation error', 'Auth error', 'Rate limit error'],
      correctAnswer: [
        'Response not received within allotted time',
        'Input does not meet schema requirements',
        'Missing or invalid credentials provided',
        'Too many requests in a given window',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Match each tool category with its purpose in the described workflow:',
      type: 'matching',
      options: ['Linter', 'Test runner', 'Bundler', 'Monitor'],
      correctAnswer: [
        'Enforcing code style and catching errors early',
        'Executing automated test suites',
        'Packaging source code for deployment',
        'Tracking runtime metrics and alerts',
      ],
      difficulty,
      marks: 8,
    },
  ];

  const mockOrdering: GeneratedQuestion[] = [
    {
      stem: 'Order the steps described in the material from first to last:',
      type: 'ordering',
      options: [
        'Step 1: Initial setup and environment configuration',
        'Step 2: Data ingestion and input preprocessing',
        'Step 3: Core processing and transformation logic',
        'Step 4: Output generation and result validation',
      ],
      correctAnswer: [
        'Step 1: Initial setup and environment configuration',
        'Step 2: Data ingestion and input preprocessing',
        'Step 3: Core processing and transformation logic',
        'Step 4: Output generation and result validation',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Arrange the following events in the order they occur according to the document:',
      type: 'ordering',
      options: [
        'User submits a request',
        'System validates the input',
        'Business logic is executed',
        'Response is returned to the user',
      ],
      correctAnswer: [
        'User submits a request',
        'System validates the input',
        'Business logic is executed',
        'Response is returned to the user',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Order these architectural decisions from most foundational to most application-specific:',
      type: 'ordering',
      options: [
        'Choose infrastructure and hosting platform',
        'Define data models and storage strategy',
        'Design API contracts and interfaces',
        'Implement business features and UI',
      ],
      correctAnswer: [
        'Choose infrastructure and hosting platform',
        'Define data models and storage strategy',
        'Design API contracts and interfaces',
        'Implement business features and UI',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Place the following debugging steps in the correct sequence:',
      type: 'ordering',
      options: [
        'Reproduce the issue reliably',
        'Isolate the failing component',
        'Identify the root cause',
        'Apply and verify the fix',
      ],
      correctAnswer: [
        'Reproduce the issue reliably',
        'Isolate the failing component',
        'Identify the root cause',
        'Apply and verify the fix',
      ],
      difficulty,
      marks: 8,
    },
    {
      stem: 'Arrange the SDLC phases described in the document in their standard sequence:',
      type: 'ordering',
      options: [
        'Requirements gathering',
        'System design',
        'Development and testing',
        'Deployment and maintenance',
      ],
      correctAnswer: [
        'Requirements gathering',
        'System design',
        'Development and testing',
        'Deployment and maintenance',
      ],
      difficulty,
      marks: 8,
    },
  ];

  const typeMap: Partial<Record<QuestionType, GeneratedQuestion[]>> = {
    mcq: mockMcq,
    mrq: mockMrq,
    true_false: mockTrueFalse,
    short_answer: mockShortAnswer,
    essay: mockEssay,
    fill_blank: mockFillBlank,
    matching: mockMatching,
    ordering: mockOrdering,
  };

  const base = typeMap[type] ?? mockMcq;

  // Honor the full requested count rather than silently truncating to the canned pool size —
  // cycle through the pool with a "(variant N)" suffix once exhausted, so batch-size requests
  // above the pool length still return exactly `count` distinguishable items. A real LLM call
  // (Phase 3) wouldn't need this; it generates fresh content per item instead of cycling.
  const requested = Math.max(1, input.count);
  const result: GeneratedQuestion[] = [];
  for (let i = 0; i < requested; i++) {
    const cycle = Math.floor(i / base.length);
    const source = base[i % base.length];
    const stem = cycle === 0 ? source.stem : `${source.stem} (variant ${cycle + 1})`;
    result.push({
      ...source,
      stem,
      explanation: input.cloText
        ? `${source.explanation ? source.explanation + ' ' : ''}[Aligned to CLO: ${input.cloText}]`
        : source.explanation,
    });
  }
  return result;
}
