import { describe, expect, it } from "vitest";
import { buildJobDiscoveryLinks } from "./jobDiscovery";

describe("job discovery links", () => {
  it("builds targeted role, location, and weekly-posting searches where the provider supports URL filters", () => {
    const links = buildJobDiscoveryLinks("Product Analyst", "Bengaluru", "week");
    const linkedIn = new URL(links.find(link => link.id === "linkedin")!.href);
    const indeed = new URL(links.find(link => link.id === "indeed")!.href);
    const google = new URL(links.find(link => link.id === "google")!.href);

    expect(links).toHaveLength(10);
    expect(linkedIn.searchParams.get("keywords")).toBe("Product Analyst");
    expect(linkedIn.searchParams.get("location")).toBe("Bengaluru");
    expect(linkedIn.searchParams.get("f_TPR")).toBe("r604800");
    expect(indeed.searchParams.get("q")).toBe("Product Analyst");
    expect(indeed.searchParams.get("l")).toBe("Bengaluru");
    expect(indeed.searchParams.get("fromage")).toBe("7");
    expect(google.searchParams.get("q")).toBe("Product Analyst Bengaluru jobs");
    expect(google.searchParams.get("tbs")).toBe("qdr:w");
  });

  it("creates a clean Naukri route, mapped YC category, and specialist-board handoff notes", () => {
    const links = buildJobDiscoveryLinks("  AI / Product Intern  ", "Remote", "day");
    const naukri = links.find(link => link.id === "naukri");
    const yc = links.find(link => link.id === "yc");
    const wellfound = links.find(link => link.id === "wellfound");
    const remoteOk = links.find(link => link.id === "remoteok");

    expect(naukri?.href).toBe("https://www.naukri.com/ai-product-intern-jobs-in-remote?jobAge=1");
    expect(yc?.href).toBe("https://www.workatastartup.com/jobs/r/product-manager");
    expect(wellfound?.directFiltersApplied).toBe(false);
    expect(wellfound?.filterNote).toContain("native Job title and Location selectors");
    expect(remoteOk?.href).toBe("https://remoteok.com/remote-ai-product-intern-jobs");
    expect(buildJobDiscoveryLinks("   ")).toEqual([]);
  });
});
