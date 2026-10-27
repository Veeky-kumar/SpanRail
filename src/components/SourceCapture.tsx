"use client";

import { useEffect } from "react";
import { serializeSource, sourceFromLocation, SOURCE_COOKIE } from "@/lib/attribution";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * On a visitor's first page, remembers where they came from (the referring host and any utm tags) in a first-party
 * cookie, so the account created later can record it. First touch wins. Does nothing if the browser sends Do Not Track.
 */
export function SourceCapture() {
  useEffect(() => {
    try {
      if (navigator.doNotTrack === "1") return;
      if (document.cookie.split("; ").some((c) => c.startsWith(`${SOURCE_COOKIE}=`))) return;
      const source = sourceFromLocation(document.referrer, window.location.search, window.location.hostname);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${SOURCE_COOKIE}=${serializeSource(source)}; Max-Age=${THIRTY_DAYS}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // Attribution is best effort; never let it affect the page.
    }
  }, []);
  return null;
}
