// file: lib/middleware/withRole.ts

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    assignedStudents?: string[];
    [key: string]: unknown;
  };
}

// Handler type accepted by withRole — receives the validated user as a third arg
export type AuthedHandler = (
  req: NextRequest,
  context: any,
  user: AuthUser
) => Promise<NextResponse>;

/**
 * RBAC middleware factory.
 * Usage: export const GET = withRole(["advisor", "admin"])(handler)
 *
 * Returns 401 if the session cookie is absent or invalid.
 * Returns 403 if the authenticated user's role is not in allowedRoles.
 * Otherwise calls through to handler, passing the validated user as the
 * third argument so handlers can apply fine-grained ownership checks.
 */
export function withRole(allowedRoles: string[]) {
  return function (handler: AuthedHandler) {
    return async function (
      req: NextRequest,
      context?: any
    ): Promise<NextResponse> {
      const sessionToken = req.cookies.get("session")?.value;

      if (!sessionToken) {
        return NextResponse.json(
          { error: "Authentication required" },
          { status: 401 }
        );
      }

      const { data, error } = await supabase.auth.getUser(sessionToken);

      if (error || !data.user) {
        return NextResponse.json(
          { error: "Invalid or expired session" },
          { status: 401 }
        );
      }

      const user = data.user as AuthUser;
      const role = user.user_metadata?.role;

      if (!role || !allowedRoles.includes(role)) {
        return NextResponse.json(
          { error: "Forbidden: insufficient permissions" },
          { status: 403 }
        );
      }

      return handler(req, context, user);
    };
  };
}
