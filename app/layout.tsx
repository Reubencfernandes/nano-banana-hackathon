/**
 * ROOT LAYOUT COMPONENT
 * 
 * Next.js 13+ app directory root layout that wraps all pages in the application.
 * Defines the basic HTML structure, fonts, and global styling for the entire app.
 * 
 * Key Features:
 * - Google Fonts integration (Geist Sans and Geist Mono)
 * - CSS custom properties for font family variables
 * - Global CSS imports (Tailwind CSS and custom styles)
 * - SEO metadata configuration
 * - Consistent theming with CSS variables for background and text colors
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";  // Modern Google Fonts
import "./globals.css";  // Tailwind CSS and global styles

/**
 * Configure Geist Sans font
 * Modern, clean sans-serif font optimized for UI text
 * Creates CSS variable --font-geist-sans for use in Tailwind classes
 */
const geistSans = Geist({
  variable: "--font-geist-sans",  // CSS custom property name
  subsets: ["latin"],             // Character subset to load (reduces bundle size)
});

/**
 * Configure Geist Mono font  
 * Monospace font for code, technical text, and fixed-width content
 * Creates CSS variable --font-geist-mono for use in Tailwind classes
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",  // CSS custom property name
  subsets: ["latin"],             // Character subset to load
});

/**
 * SEO metadata configuration for the application
 * Defines title, description, and other meta tags for search engines and social media
 */
export const metadata: Metadata = {
  title: "Nano Banana Editor",                     // Browser tab title and SEO title
  description: "Node-based photo editor for characters",  // Meta description for search results
};

/**
 * Root Layout Component
 * 
 * Wraps all pages with consistent HTML structure and styling.
 * All pages in the app will be rendered inside the {children} placeholder.
 * 
 * @param children React components representing the current page content
 * @returns Complete HTML document structure with fonts and styling applied
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;  // Type-safe children prop
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
