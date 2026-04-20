"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    // Auth removed — redirect to board
    router.replace("/board");
  }, [router]);

  return null;
}
