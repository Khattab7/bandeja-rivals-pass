import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PKPass } from "passkit-generator";
import path from "path";
import fs from "fs";

function formatDate(dateStr: string) {
  return new Date(dateStr)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase()
    .replace(",", "");
}

export async function GET() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("members")
    .select("id, name, member_id, is_active, valid_until")
    .eq("user_id", user.id)
    .single();

  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (!member.is_active) return NextResponse.json({ error: "Membership not active" }, { status: 403 });

  const wwdr = Buffer.from(process.env.APPLE_WWDR_PEM_B64!, "base64");
  const signerCert = Buffer.from(process.env.APPLE_CERT_PEM_B64!, "base64");
  const signerKey = Buffer.from(process.env.APPLE_KEY_PEM_B64!, "base64");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bandeja-rivals-pass.vercel.app";
  const validationUrl = `${appUrl}/validate/${member.id}`;

  const modelDir = path.join(process.cwd(), "public/pass-model/bandeja.pass");
  const logoBuffer = fs.readFileSync(path.join(modelDir, "logo.png"));

  const pass = new PKPass(
    {
      "pass.json": fs.readFileSync(path.join(modelDir, "pass.json")),
      "icon.png": logoBuffer,
      "icon@2x.png": logoBuffer,
      "logo.png": logoBuffer,
      "logo@2x.png": logoBuffer,
      "strip.png": fs.readFileSync(path.join(modelDir, "strip.png")),
      "strip@2x.png": fs.readFileSync(path.join(modelDir, "strip@2x.png")),
      "strip@3x.png": fs.readFileSync(path.join(modelDir, "strip@3x.png")),
    },
    { wwdr, signerCert, signerKey },
    { serialNumber: member.id }
  );

  pass.type = "storeCard";
  pass.primaryFields.push({ key: "name", label: "MEMBER", value: member.name.toUpperCase() });
  pass.secondaryFields.push({ key: "memberId", label: "PASS ID", value: member.member_id });
  pass.secondaryFields.push({ key: "validUntil", label: "VALID UNTIL", value: formatDate(member.valid_until) });
  pass.setBarcodes({ message: validationUrl, format: "PKBarcodeFormatQR", messageEncoding: "iso-8859-1" });

  const buffer = pass.getAsBuffer();

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="bandeja-rivals-pass.pkpass"`,
    },
  });
}
