import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "회의록 자동화",
  description: "녹음하면 자동으로 저장·분석·Slack 전달까지",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
