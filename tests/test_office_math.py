from docx import Document
from docx.oxml import parse_xml
from lxml import etree
from pptx import Presentation
from pptx.util import Inches

from backend.material_processing import read_material

_NS = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
_FRAC = f'<m:oMath {_NS}><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup></m:den></m:f></m:oMath>'


def test_docx_and_slides_keep_native_math_at_its_position(tmp_path):
    word = Document()
    paragraph = word.add_paragraph("Inverse square: ")
    paragraph._p.append(parse_xml(_FRAC))
    paragraph.add_run(" for positive x.")
    path = tmp_path / "formula.docx"
    word.save(path)
    expected = r"Inverse square: \(\frac{1}{{x}^{2}}\) for positive x."
    assert read_material(path, pages=None, figures=False).blocks[0].text == expected

    slides = Presentation()
    shape = slides.slides.add_slide(slides.slide_layouts[6]).shapes.add_textbox(
        Inches(1), Inches(1), Inches(4), Inches(2))
    p = shape.text_frame.paragraphs[0]
    p.add_run().text = "Inverse square: "
    p._p.append(etree.fromstring(_FRAC.encode()))
    p.add_run().text = " for positive x."
    path = tmp_path / "formula.pptx"
    slides.save(path)
    assert read_material(path, pages=None, figures=False).blocks[0].text == expected


def test_unhandled_office_math_never_yields_a_truncated_course_fact(tmp_path):
    doc = Document()
    p = doc.add_paragraph("Quotient: ")
    p._p.append(parse_xml(f'<m:oMath {_NS}><m:phant><m:e><m:r><m:t>x</m:t></m:r></m:e></m:phant></m:oMath>'))
    doc.add_paragraph("Product: Multiply both quantities.")
    path = tmp_path / "special.docx"
    doc.save(path)
    material = read_material(path, pages=None, figures=False)
    assert len(material.blocks) == 1 and material.blocks[0].text.startswith("Product")
    assert material.warnings



def test_office_text_runs_preserve_chemistry_and_units(tmp_path):
    word = Document()
    p = word.add_paragraph("Water: H")
    p.add_run("2").font.subscript = True
    p.add_run("O.")
    path = tmp_path / "chem.docx"
    word.save(path)
    assert read_material(path, pages=None, figures=False).blocks[0].text == "Water: H<sub>2</sub>O."
