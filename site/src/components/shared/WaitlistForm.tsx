'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { waitlistFormSchema, type WaitlistFormData } from '@/lib/validation';
import Button from '@/components/ui/Button';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function WaitlistForm() {
  const [formState, setFormState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistFormSchema),
  });

  const onSubmit = async (data: WaitlistFormData) => {
    setFormState('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong');
      }

      setFormState('success');
      reset();
    } catch (err) {
      setFormState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (formState === 'success') {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
        <p className="text-lg font-medium text-success">You&apos;re on the list.</p>
        <p className="mt-2 text-sm text-text-secondary">
          We&apos;ll reach out when early access opens.
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => setFormState('idle')}
        >
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Email — required */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-text-primary mb-1">
          Email <span className="text-error">*</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber min-h-[44px]"
          placeholder="you@company.com"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-error">{errors.email.message}</p>
        )}
      </div>

      {/* Name — optional */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-text-primary mb-1">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          {...register('name')}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber min-h-[44px]"
          placeholder="Your name"
        />
      </div>

      {/* Role — optional */}
      <div>
        <label htmlFor="role" className="block text-sm font-medium text-text-primary mb-1">
          Role
        </label>
        <select
          id="role"
          {...register('role')}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber min-h-[44px]"
        >
          <option value="">Select a role…</option>
          <option value="agent_developer">Agent Developer</option>
          <option value="enterprise">Enterprise</option>
          <option value="service_provider">Service Provider</option>
          <option value="individual">Individual</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Message — optional */}
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-text-primary mb-1">
          Message
        </label>
        <textarea
          id="message"
          rows={3}
          {...register('message')}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/50 focus:border-amber focus:outline-none focus:ring-1 focus:ring-amber"
          placeholder="Tell us about your use case…"
        />
      </div>

      {formState === 'error' && (
        <p className="text-sm text-error">{errorMsg}</p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={formState === 'submitting'}>
        {formState === 'submitting' ? 'Submitting…' : 'Join the Waitlist'}
      </Button>
    </form>
  );
}
