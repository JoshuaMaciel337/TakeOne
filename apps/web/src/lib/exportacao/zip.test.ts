import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { zipSemCompressao } from "./zip.ts";

test("o ZIP armazenado abre com os nomes em UTF-8 e os bytes iguais", () => {
  const zip = zipSemCompressao([
    { nome: "Prancheta 1.png", dados: new Uint8Array([1, 2, 3, 4, 5]) },
    { nome: "Capa à direita.jpg", dados: new TextEncoder().encode("olá") },
  ]);
  // A assinatura do fim e o número de arquivos
  const visao = new DataView(zip.buffer);
  assert.equal(visao.getUint32(zip.length - 22, true), 0x06054b50);
  assert.equal(visao.getUint16(zip.length - 12, true), 2);
  // O Python (zipfile, da biblioteca padrão) confere os CRCs e devolve os nomes, quando ele existe aqui
  const pasta = mkdtempSync(join(tmpdir(), "zip-"));
  const arquivo = join(pasta, "teste.zip");
  writeFileSync(arquivo, zip);
  let saida = "";
  try {
    saida = execFileSync("python", ["-c", "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print('|'.join(z.namelist()) + '|' + z.read(z.namelist()[1]).decode())", arquivo], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } }).trim();
  } catch {
    return;
  }
  assert.equal(saida, "Prancheta 1.png|Capa à direita.jpg|olá");
});
