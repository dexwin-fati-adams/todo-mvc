import { pgTable, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';


export const todosTable = pgTable(
  'todos',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    completed: boolean('completed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    completedIdx: index('todos_completed_idx').on(table.completed),
  }),
);

export type TodoDbRow = typeof todosTable.$inferSelect;
export type NewTodoDbRow = typeof todosTable.$inferInsert;
