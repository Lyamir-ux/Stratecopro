"""Écriture d'un classeur .xlsx minimal, sans dépendance (bibliothèque standard).

Pourquoi pas openpyxl : openpyxl enregistre les formules SANS leur valeur
calculée. Or le logiciel lit les deux - la formule (« =D21+D22 » : lignes
retenues dans l'assiette MaPrimeRénov') ET la valeur (montants). Un classeur
écrit par openpyxl et jamais rouvert dans Excel arriverait sans montants.
Ici, chaque cellule à formule porte aussi sa valeur (<f> + <v>), et Excel
recalcule tout à l'ouverture (fullCalcOnLoad).
"""
from __future__ import annotations

import math
import zipfile
from xml.sax.saxutils import escape

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

# Styles (index de cellXfs)
NORMAL, GRAS, MONTANT, MONTANT_GRAS, POURCENT = 0, 1, 2, 3, 4


def lettre_colonne(c: int) -> str:
    """0 → A, 25 → Z, 26 → AA."""
    s = ""
    c += 1
    while c:
        c, r = divmod(c - 1, 26)
        s = chr(65 + r) + s
    return s


def ref(c: int, r: int) -> str:
    """Référence A1 depuis des indices 0-based (colonne, ligne)."""
    return f"{lettre_colonne(c)}{r + 1}"


def nombre_xml(v: float) -> str:
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if not math.isfinite(v):
        raise ValueError(f"valeur non finie : {v}")
    if float(v).is_integer() and abs(v) < 1e15:
        return str(int(v))
    return repr(float(v))


class Feuille:
    def __init__(self, nom: str):
        self.nom = nom
        self.cellules: dict[tuple[int, int], tuple] = {}
        self.largeurs: dict[int, float] = {}

    def ecrire(self, r: int, c: int, valeur=None, formule: str | None = None, style: int | None = None):
        """r, c : indices 0-based. formule sans « = »."""
        if valeur is None and formule is None:
            return
        if formule is not None and formule.startswith("="):
            formule = formule[1:]
        if style is None:
            style = MONTANT if isinstance(valeur, (int, float)) and not isinstance(valeur, bool) else NORMAL
        self.cellules[(r, c)] = (valeur, formule, style)

    def xml(self) -> str:
        lignes: dict[int, list[int]] = {}
        for (r, c) in self.cellules:
            lignes.setdefault(r, []).append(c)
        max_r = max((r for r, _ in self.cellules), default=0)
        max_c = max((c for _, c in self.cellules), default=0)
        out = [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            f'<worksheet xmlns="{NS}" xmlns:r="{NS_R}">',
            f'<dimension ref="A1:{ref(max_c, max_r)}"/>',
        ]
        if self.largeurs:
            out.append("<cols>")
            for c in sorted(self.largeurs):
                out.append(f'<col min="{c + 1}" max="{c + 1}" width="{self.largeurs[c]}" customWidth="1"/>')
            out.append("</cols>")
        out.append("<sheetData>")
        for r in sorted(lignes):
            out.append(f'<row r="{r + 1}">')
            for c in sorted(lignes[r]):
                v, f, s = self.cellules[(r, c)]
                a = f'r="{ref(c, r)}"' + (f' s="{s}"' if s else "")
                if f is not None:
                    if v is None:
                        v = 0
                    if isinstance(v, str):
                        out.append(f'<c {a} t="str"><f>{escape(f)}</f><v>{escape(v)}</v></c>')
                    else:
                        out.append(f"<c {a}><f>{escape(f)}</f><v>{nombre_xml(v)}</v></c>")
                elif isinstance(v, str):
                    out.append(f'<c {a} t="inlineStr"><is><t xml:space="preserve">{escape(v)}</t></is></c>')
                elif isinstance(v, bool):
                    out.append(f'<c {a} t="b"><v>{nombre_xml(v)}</v></c>')
                else:
                    out.append(f"<c {a}><v>{nombre_xml(v)}</v></c>")
            out.append("</row>")
        out.append("</sheetData>")
        out.append('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
        out.append("</worksheet>")
        return "".join(out)


INTERDITS_ONGLET = set('\\/?*[]:')


def nom_onglet(base: str, deja: set[str]) -> str:
    """Nom d'onglet valide (31 caractères, sans \\ / ? * [ ] :), unique."""
    nom = "".join(" " if ch in INTERDITS_ONGLET else ch for ch in base)
    nom = " ".join(nom.split())[:31].strip()
    i = 2
    base_nom = nom
    while nom.lower() in {d.lower() for d in deja}:
        nom = f"{base_nom[:28]} {i}"
        i += 1
    deja.add(nom)
    return nom


STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<styleSheet xmlns="{NS}">'
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="5">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    "</cellXfs>"
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    "</styleSheet>"
)


class Classeur:
    def __init__(self):
        self.feuilles: list[Feuille] = []
        self._noms: set[str] = set()

    def feuille(self, nom: str) -> Feuille:
        f = Feuille(nom_onglet(nom, self._noms))
        self.feuilles.append(f)
        return f

    def enregistrer(self, chemin: str) -> None:
        n = len(self.feuilles)
        types = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for i in range(n)
            )
            + "</Types>"
        )
        rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        )
        workbook = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<workbook xmlns="{NS}" xmlns:r="{NS_R}"><sheets>'
            + "".join(f'<sheet name="{escape(f.nom, {chr(34): "&quot;"})}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, f in enumerate(self.feuilles))
            + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
        )
        wb_rels = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>'
                for i in range(n)
            )
            + f'<Relationship Id="rId{n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>"
        )
        with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", types)
            z.writestr("_rels/.rels", rels)
            z.writestr("xl/workbook.xml", workbook)
            z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
            z.writestr("xl/styles.xml", STYLES)
            for i, f in enumerate(self.feuilles):
                z.writestr(f"xl/worksheets/sheet{i + 1}.xml", f.xml())
