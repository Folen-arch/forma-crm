import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forma — студия под контролем",
  description:
    "Простое рабочее пространство для фрилансеров: клиенты, проекты, задачи и финансы в одном месте.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
