import type { Institution } from '@/types';

export const mockInstitutions: Institution[] = [
  {
    id: 'inst-1',
    name: 'State University',
    domain: 'university.edu',
    joinCode: 'SU-2024-XK9M',
    createdAt: '2024-01-15T08:00:00Z',
  },
  {
    id: 'inst-2',
    name: 'Tech College of Applied Sciences',
    domain: 'techcollege.edu',
    joinCode: 'TC-2024-PL3N',
    createdAt: '2024-02-20T09:30:00Z',
  },
  {
    id: 'inst-3',
    name: 'Global Certification Institute',
    domain: 'globalcert.org',
    joinCode: 'GCI-2024-RW7Q',
    createdAt: '2024-03-05T11:00:00Z',
  },
];
