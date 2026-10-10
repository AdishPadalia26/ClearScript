"use client";

import { createContext, useContext } from "react";

// Lives apart from ConsoleShell so pages can open the upload dialog without bundling the shell.
export const UploadContext = createContext<() => void>(() => {});
/** Opens the shell's upload dialog from anywhere in the console. */
export const useOpenUpload = () => useContext(UploadContext);
