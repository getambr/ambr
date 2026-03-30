import type { Metadata } from 'next';

interface OgMetadataOptions {
  title: string;
  description: string;
  path: string;
  label?: string;
  domain?: 'ambr.run' | 'getamber.dev';
}

export function createOgMetadata(opts: OgMetadataOptions): Pick<Metadata, 'openGraph' | 'twitter'> {
  const domain = opts.domain ?? 'ambr.run';
  const ogUrl = new URL('/api/og', `https://${domain}`);
  ogUrl.searchParams.set('title', opts.title);
  if (opts.label) ogUrl.searchParams.set('label', opts.label);
  if (opts.description) ogUrl.searchParams.set('description', opts.description);
  ogUrl.searchParams.set('domain', domain);

  const imageUrl = ogUrl.toString();

  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: `https://${domain}${opts.path}`,
      siteName: 'Ambr',
      type: 'website',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: opts.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [imageUrl],
    },
  };
}
