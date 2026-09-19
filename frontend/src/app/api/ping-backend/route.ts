import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api";

export async function GET() {
  try {
    const apiBase = getApiBaseUrl();
    
    // Ping the backend /health endpoint
    const response = await fetch(`${apiBase}/health`, {
      headers: {
        "bypass-tunnel-reminder": "true",
      },
      cache: "no-store",
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        status: "success",
        message: "Render backend pinged successfully",
        data,
      });
    }

    return NextResponse.json(
      { status: "error", message: `Render backend returned status ${response.status}` },
      { status: 500 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "error", message: `Ping failed: ${msg}` },
      { status: 500 }
    );
  }
}
