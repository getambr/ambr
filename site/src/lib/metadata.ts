import { Metadata } from 'next';
import { BRAND } from './brand';

const baseUrl = BRAND.domains.marketing;

export function generatePageMetadata(page: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return {
    title: `${page.title} | ${BRAND.name}`,
    description: page.description,
    openGraph: {
      title: `${page.title} | ${BRAND.name}`,
      description: page.description,
      url: `${baseUrl}${page.path}`,
      siteName: BRAND.name,
      type: 'website',
    },
    alternates: {
      canonical: `${baseUrl}${page.path}`,
    },
  };
}
