"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TrackingConfig = {
  metaPixelId: string;
  tiktokPixelId: string;
  googleTagId: string;
  googleTagManagerContainerId: string;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    fbq?: {
      (...args: unknown[]): void;
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      push?: (...args: unknown[]) => void;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: Window["fbq"];
    ttq?: {
      page?: () => void;
      track?: (...args: unknown[]) => void;
      load?: (pixelId: string) => void;
      pageview?: () => void;
    };
    gtag?: (...args: unknown[]) => void;
  }
}

const EMPTY_CONFIG: TrackingConfig = {
  metaPixelId: "",
  tiktokPixelId: "",
  googleTagId: "",
  googleTagManagerContainerId: "",
};

function hasConfiguredTracking(config: TrackingConfig) {
  return Boolean(
    config.metaPixelId ||
      config.tiktokPixelId ||
      config.googleTagId ||
      config.googleTagManagerContainerId
  );
}

function routePath(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function MarketingTrackingPixels() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<TrackingConfig>(EMPTY_CONFIG);

  const currentPath = useMemo(
    () => routePath(pathname, searchParams),
    [pathname, searchParams]
  );

  useEffect(() => {
    let isMounted = true;

    fetch("/api/tracking/config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : EMPTY_CONFIG))
      .then((payload) => {
        if (!isMounted) return;
        setConfig({
          metaPixelId: String(payload?.metaPixelId || ""),
          tiktokPixelId: String(payload?.tiktokPixelId || ""),
          googleTagId: String(payload?.googleTagId || ""),
          googleTagManagerContainerId: String(
            payload?.googleTagManagerContainerId || ""
          ),
        });
      })
      .catch(() => {
        if (isMounted) setConfig(EMPTY_CONFIG);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasConfiguredTracking(config)) return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: "matchindeed_page_view",
      page_path: currentPath,
    });

    window.fbq?.("track", "PageView");
    window.ttq?.page?.();
    window.gtag?.("config", config.googleTagId, {
      page_path: currentPath,
    });
  }, [config, currentPath]);

  if (!hasConfiguredTracking(config)) return null;

  return (
    <>
      {config.googleTagManagerContainerId && (
        <Script
          id="matchindeed-gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${config.googleTagManagerContainerId}');
            `,
          }}
        />
      )}

      {config.googleTagId && (
        <>
          <Script
            id="matchindeed-google-tag-src"
            src={`https://www.googletagmanager.com/gtag/js?id=${config.googleTagId}`}
            strategy="afterInteractive"
          />
          <Script
            id="matchindeed-google-tag"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${config.googleTagId}');
              `,
            }}
          />
        </>
      )}

      {config.metaPixelId && (
        <Script
          id="matchindeed-meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${config.metaPixelId}');
            `,
          }}
        />
      )}

      {config.tiktokPixelId && (
        <Script
          id="matchindeed-tiktok-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function (w, d, t) {
                w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
                ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];
                ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
                for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
                ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
                ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;
                ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};
                n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;
                e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
                ttq.load('${config.tiktokPixelId}');
                ttq.page();
              }(window, document, 'ttq');
            `,
          }}
        />
      )}
    </>
  );
}
