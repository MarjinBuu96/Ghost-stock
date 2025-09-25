// src/app/shopify/exit-iframe/page.tsx
export const dynamic = "force-static";

export default function ExitIframe() {
  return (
    <html>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              const p = new URLSearchParams(window.location.search);
              const target = p.get('target') || '/';
              if (window.top === window.self) location.href = target;
              else window.top.location.href = target;
            `,
          }}
        />
      </body>
    </html>
  );
}