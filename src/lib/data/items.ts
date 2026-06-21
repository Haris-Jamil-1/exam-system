// Phase 2: replace each function body with Supabase/Prisma query.
import type { Item } from '@/types';
import { mockItems } from '@/lib/mock-data/items';

const itemsDb = [...mockItems];

export interface ItemFilters {
  type?: string;
  difficulty?: string;
  status?: string;
  authorId?: string;
}

export async function getItems(filters?: ItemFilters): Promise<Item[]> {
  // Phase 2: prisma.item.findMany({ where: { ...filters } })
  return itemsDb.filter(item => {
    if (filters?.type && item.type !== filters.type) return false;
    if (filters?.difficulty && item.difficulty !== filters.difficulty) return false;
    if (filters?.status && item.status !== filters.status) return false;
    if (filters?.authorId && item.authorId !== filters.authorId) return false;
    return true;
  });
}

export async function getItemById(id: string): Promise<Item | undefined> {
  // Phase 2: prisma.item.findUnique({ where: { id } }) ?? undefined
  return itemsDb.find(i => i.id === id);
}

export async function createItem(data: Omit<Item, 'id' | 'createdAt' | 'usageCount'>): Promise<Item> {
  // Phase 2: prisma.item.create({ data })
  const newItem: Item = {
    ...data,
    id: `item-${Date.now()}`,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };
  itemsDb.push(newItem);
  return newItem;
}

export async function updateItem(id: string, data: Partial<Item>): Promise<Item | undefined> {
  // Phase 2: prisma.item.update({ where: { id }, data })
  const index = itemsDb.findIndex(i => i.id === id);
  if (index === -1) return undefined;
  itemsDb[index] = { ...itemsDb[index], ...data };
  return itemsDb[index];
}
