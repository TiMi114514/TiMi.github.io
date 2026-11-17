'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAnalyticsAliasPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin');
  }, [router]);
  return <div className="h-40 animate-pulse rounded-xl bg-[#e4e4e7]/60" />;
}
