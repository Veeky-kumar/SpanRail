"use client";

import { createContext } from "react";

/** Which stage of the call the reader is on, shared by the stepper and the isometric figure. */
export const JourneyContext = createContext<{ step: number; reused: boolean }>({ step: 0, reused: false });
