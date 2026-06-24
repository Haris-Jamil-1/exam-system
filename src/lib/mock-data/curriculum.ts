// Phase 2: seed this data via prisma/seed.ts
// Relationships: Institution → Course → Topic → LearningObjective
// Questions link to LearningObjective via learning_objective_id FK
import type { Course, Topic, LearningObjective } from '@/types';

export const mockCourses: Course[] = [
  {
    id: 'course-1',
    code: 'CS101',
    title: 'Introduction to Computer Science',
    institutionId: 'inst-1',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'course-2',
    code: 'NET201',
    title: 'Computer Networks & Security',
    institutionId: 'inst-1',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'course-3',
    code: 'SE301',
    title: 'Software Engineering Principles',
    institutionId: 'inst-1',
    createdAt: '2024-01-01T00:00:00Z',
  },
];

export const mockTopics: Topic[] = [
  // CS101
  { id: 'topic-1', courseId: 'course-1', title: 'Operating Systems', order: 1, createdAt: '2024-01-10T00:00:00Z' },
  { id: 'topic-2', courseId: 'course-1', title: 'Data Structures & Algorithms', order: 2, createdAt: '2024-01-10T00:00:00Z' },
  { id: 'topic-3', courseId: 'course-1', title: 'Object-Oriented Programming', order: 3, createdAt: '2024-01-10T00:00:00Z' },
  // NET201
  { id: 'topic-4', courseId: 'course-2', title: 'OSI Model & Protocols', order: 1, createdAt: '2024-01-10T00:00:00Z' },
  { id: 'topic-5', courseId: 'course-2', title: 'Network Security & Threats', order: 2, createdAt: '2024-01-10T00:00:00Z' },
  // SE301
  { id: 'topic-6', courseId: 'course-3', title: 'Software Development Lifecycle', order: 1, createdAt: '2024-01-10T00:00:00Z' },
  { id: 'topic-7', courseId: 'course-3', title: 'Design Patterns', order: 2, createdAt: '2024-01-10T00:00:00Z' },
];

export const mockCLOs: LearningObjective[] = [
  // topic-1: Operating Systems
  {
    id: 'clo-1',
    topicId: 'topic-1',
    code: 'CS101-1-CLO1',
    text: 'Explain the primary purpose and core components of an operating system',
    bloomsLevel: 'Understand',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'clo-2',
    topicId: 'topic-1',
    code: 'CS101-1-CLO2',
    text: 'Analyze virtual memory mechanisms including page tables and TLB',
    bloomsLevel: 'Analyze',
    learningDomain: 'Skill',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-2: Data Structures
  {
    id: 'clo-3',
    topicId: 'topic-2',
    code: 'CS101-2-CLO1',
    text: 'Compare time and space complexities of common sorting algorithms',
    bloomsLevel: 'Analyze',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'clo-4',
    topicId: 'topic-2',
    code: 'CS101-2-CLO2',
    text: 'Apply appropriate data structures to solve algorithmic problems',
    bloomsLevel: 'Apply',
    learningDomain: 'Skill',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-3: OOP
  {
    id: 'clo-5',
    topicId: 'topic-3',
    code: 'CS101-3-CLO1',
    text: 'Explain the four pillars of object-oriented programming',
    bloomsLevel: 'Understand',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-4: OSI
  {
    id: 'clo-6',
    topicId: 'topic-4',
    code: 'NET201-1-CLO1',
    text: 'Identify the function and responsibilities of each OSI model layer',
    bloomsLevel: 'Remember',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'clo-7',
    topicId: 'topic-4',
    code: 'NET201-1-CLO2',
    text: 'Distinguish between connection-oriented and connectionless protocols',
    bloomsLevel: 'Understand',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-5: Network Security
  {
    id: 'clo-8',
    topicId: 'topic-5',
    code: 'NET201-2-CLO1',
    text: 'Identify and classify common web security vulnerabilities (OWASP Top 10)',
    bloomsLevel: 'Analyze',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'clo-9',
    topicId: 'topic-5',
    code: 'NET201-2-CLO2',
    text: 'Apply security countermeasures to prevent common attack vectors',
    bloomsLevel: 'Apply',
    learningDomain: 'Skill',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-6: SDLC
  {
    id: 'clo-10',
    topicId: 'topic-6',
    code: 'SE301-1-CLO1',
    text: 'Sequence the phases of the software development lifecycle',
    bloomsLevel: 'Remember',
    learningDomain: 'Knowledge',
    createdAt: '2024-01-15T00:00:00Z',
  },
  // topic-7: Design Patterns
  {
    id: 'clo-11',
    topicId: 'topic-7',
    code: 'SE301-2-CLO1',
    text: 'Apply appropriate design patterns to common software engineering problems',
    bloomsLevel: 'Apply',
    learningDomain: 'Skill',
    createdAt: '2024-01-15T00:00:00Z',
  },
];
