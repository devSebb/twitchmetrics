import { cache } from "react";
import { auth } from "@/lib/auth";

export const getSession = cache(() => auth());
