'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Old /wallet route — redirect to the merged Profile page */
export default function WalletRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/profile');
  }, [router]);
  return null;
}