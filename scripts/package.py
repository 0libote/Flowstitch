"""Build a local installation ZIP without publishing anything."""
from pathlib import Path
import hashlib
import json
import zipfile
manifest = json.loads(Path('manifest.json').read_text())
version = manifest['version']
folder = Path('dist/flowstitch')
files = [folder / name for name in ('main.js', 'manifest.json', 'styles.css')]
archive = Path(f'dist/flowstitch-{version}.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as target:
    for file in files:
        target.write(file, 'flowstitch/' + file.name)
    for file in [Path('LICENSE'), Path('README.md'), *[p for p in Path('docs').rglob('*') if p.suffix in ('.md', '.html', '.png')]]:
        target.write(file, 'flowstitch/' + str(file))
checksums = {str(file): hashlib.sha256(file.read_bytes()).hexdigest() for file in [*files, archive]}
Path('dist/SHA256SUMS.json').write_text(json.dumps(checksums, indent=2) + '\n')
print(f'Packaged {archive} ({archive.stat().st_size} bytes)')
