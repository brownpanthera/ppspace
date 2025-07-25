import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date().optional(),
    description: z.string().optional(),
  }),
});

export const collections = {
  blog,
}; 