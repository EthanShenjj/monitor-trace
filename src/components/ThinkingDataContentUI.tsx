"use client";

import { useEffect } from "react";
import * as contentUISDK from "td-content-ui-js";
import { initThinkingDataMessages } from "@/lib/thinkingdataMessages";

declare global {
  interface Window {
    TDContentUI?: typeof contentUISDK;
  }
}

export default function ThinkingDataContentUI() {
  useEffect(() => {
    // The ThinkingData strategy SDK looks up this browser global to render messages.
    window.TDContentUI = contentUISDK;
    void initThinkingDataMessages();
  }, []);

  return null;
}
