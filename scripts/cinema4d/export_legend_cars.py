"""
US Legends configurator: export "Legend Cars.c4d" for the web build.

Run in Cinema 4D 2023 or newer (the trial works):
  Extensions > Script Manager > File > Load Script... > this file > Execute,
  then pick "Legend Cars.c4d" when asked.

What it does (the .c4d file itself is never changed or saved):
  - Swaps each Octane material for a plain material named "NN Name" (NN = its position in the
    material list), because Octane materials don't survive glTF export. The web build maps those
    numbers to web materials in scripts/c4d-materials.mjs.
  - Saves every material's preview image, for matching the web materials by eye.
  - Removes the studio set and cameras, switches every car option on, and exports glTF.

Output, in a "web-export" folder next to the .c4d file:
  legend-cars-named.gltf   the scene with every option   -> npm run models:c4d
  materials/NN.png         material previews
  materials.txt            material list (number, name, type, average preview color)
"""
import c4d, os, traceback


def main():
    src = c4d.storage.LoadDialog(title="Choose Legend Cars.c4d", flags=c4d.FILESELECT_LOAD)
    if not src:
        return
    out = os.path.join(os.path.dirname(src), "web-export")
    prev_dir = os.path.join(out, "materials")
    os.makedirs(prev_dir, exist_ok=True)
    log = open(os.path.join(out, "materials.txt"), "w", encoding="utf-8")
    p = lambda *a: log.write(" ".join(str(x) for x in a) + "\n")
    try:
        doc = c4d.documents.LoadDocument(src, c4d.SCENEFILTER_OBJECTS | c4d.SCENEFILTER_MATERIALS, None)
        replacement = {}
        for i, m in enumerate(doc.GetMaterials()):
            label = "%02d %s" % (i, m.GetName())
            avg = None
            try:
                bmp = m.GetPreview(0)
                if bmp:
                    bmp.Save(os.path.join(prev_dir, "%02d.png" % i), c4d.FILTER_PNG)
                    w, h = bmp.GetSize()
                    tot, n = [0, 0, 0], 0
                    for y in range(h // 3, 2 * h // 3, 2):
                        for x in range(w // 3, 2 * w // 3, 2):
                            r, g, b = bmp.GetPixel(x, y)
                            tot[0] += r; tot[1] += g; tot[2] += b; n += 1
                    avg = [t / n / 255.0 for t in tot] if n else None
            except Exception as e:
                p("preview failed", label, e)
            p(i, m.GetName(), "<" + m.GetTypeName() + ">", "avg=" + (",".join("%.3f" % v for v in avg) if avg else "none"))
            if m.GetType() != c4d.Mmaterial:
                std = c4d.BaseMaterial(c4d.Mmaterial)
                std.SetName(label)
                if avg:
                    std[c4d.MATERIAL_COLOR_COLOR] = c4d.Vector(*avg)
                doc.InsertMaterial(std)
                replacement[m] = std
            else:
                m.SetName(label)

        def retag(op):
            while op:
                for t in op.GetTags():
                    if t.CheckType(c4d.Ttexture) and t.GetMaterial() in replacement:
                        t.SetMaterial(replacement[t.GetMaterial()])
                retag(op.GetDown())
                op = op.GetNext()
        retag(doc.GetFirstObject())

        for name in ("Studio", "Camera"):
            o = doc.SearchObject(name)
            if o:
                o.Remove()

        # The scene hides all but one option per group; the web configurator needs them all.
        def show(op, depth):
            while op:
                if depth <= 2:
                    op.SetEditorMode(c4d.MODE_UNDEF)
                    op.SetRenderMode(c4d.MODE_UNDEF)
                show(op.GetDown(), depth + 1)
                op = op.GetNext()
        show(doc.GetFirstObject(), 0)

        fid = getattr(c4d, "FORMAT_GLTFEXPORT", 1041129)
        plug = c4d.plugins.FindPlugin(fid, c4d.PLUGINTYPE_SCENESAVER)
        data = {}
        plug.Message(c4d.MSG_RETRIEVEPRIVATEDATA, data)
        ex = data.get("imexporter")
        # glTF exporter parameter IDs (Cinema 4D 2027): cameras, transform/morph/skin animation off,
        # textures on, texture resize off.
        for pid, val in ((1024, False), (1014, False), (1015, False), (1019, False), (1005, True), (1008, 1009)):
            try:
                ex[pid] = val
            except Exception as e:
                p("could not set", pid, e)
        doc.ExecutePasses(None, True, True, True, c4d.BUILDFLAGS_NONE)
        target = os.path.join(out, "legend-cars-named.gltf")
        ok = c4d.documents.SaveDocument(doc, target, c4d.SAVEDOCUMENTFLAGS_DONTADDTORECENTLIST, fid)
        p("Export", "OK" if ok else "FAILED", target)
        c4d.documents.KillDocument(doc)
        c4d.gui.MessageDialog(("Export finished." if ok else "Export failed.") + "\n" + out)
    except Exception:
        p("ERROR\n" + traceback.format_exc())
        c4d.gui.MessageDialog("Export hit an error. Details: " + os.path.join(out, "materials.txt"))
    finally:
        log.close()


if __name__ == "__main__":
    main()
