import { z } from 'zod/v4';

export const waitlistFormSchema = z.object({
  email: z.email('Please enter a valid email address'),
  name: z.string().max(200).default(''),
  role: z.enum(['agent_developer', 'enterprise', 'service_provider', 'individual', 'other']).optional(),
  message: z.string().max(5000).default(''),
});

export type WaitlistFormData = z.input<typeof waitlistFormSchema>;
