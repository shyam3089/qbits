import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile,CompileError} from '../language/index.js';

const source=`component Files:
    state photo = null
    state photos = [] as File

    action uploadPhoto(file):
        post "/photos"
        upload "photo" = file

    action selectFiles(files):
        post "/selection"
        response string

    input type="file" bind=photo
    input type="file" on change uploadPhoto(event.file)
    input:
        type="file"
        on change:
            photo = event.file
            photos = event.files
            selectFiles(event.files)
    button:
        on click:
            photo = null`;

test('Stage 4A.2.1 parses nullable File state, File lists, bind and file event references',()=>{
  const compiled=compile(source,'Files.qb'),[photo,photos]=compiled.ast.states,roots=compiled.ast.roots;
  assert.equal(photo.initial.kind,'literal');assert.equal(photo.initial.kind==='literal'&&photo.initial.value,null);
  assert.equal(photos.initial.kind,'list');assert.equal(photos.initial.kind==='list'&&photos.initial.itemType?.value,'File');
  assert.equal(roots[0].kind==='element'&&roots[0].attributes.bind.kind,'reference');
  assert.equal(roots[1].kind==='element'&&roots[1].handler?.statements[0].kind,'invoke');
  const inline=roots[1].kind==='element'&&roots[1].handler?.statements[0];assert.equal(inline&&inline.kind==='invoke'&&inline.arguments[0].kind,'member');assert.equal(inline&&inline.kind==='invoke'&&inline.arguments[0].kind==='member'&&inline.arguments[0].name.value,'file');
  assert.match(compiled.code,/"value":null/);assert.match(compiled.code,/"itemType":"File"/);assert.match(compiled.code,/"name":"event"/);assert.match(compiled.code,/"name":"files"/);
  assert.doesNotThrow(()=>compile(source.replace('state photo = null','photo = null'),'LegacyFileState.qb'));
  assert.doesNotThrow(()=>compile(`component AssignedFile:
    state photo = null
    input:
        type="file"
        on change:
            photo = event.file`,'AssignedFile.qb'));
});

test('Stage 4A.2.1 file diagnostics are strict and source-located',()=>{
  const rejects=(text:string,pattern:RegExp)=>assert.throws(()=>compile(text,'InvalidFiles.qb'),(error:unknown)=>error instanceof CompileError&&pattern.test(error.message)&&error.diagnostic.line>0&&error.diagnostic.column>0,text);
  rejects(`component C:
    state photo = null
    p text="unused"`,/null state requires input type="file" bind/);
  rejects(`component C:
    state photo = null
    input bind=photo`,/bind is supported only on input type="file"/);
  rejects(`component C:
    state photos = [] as File
    input type="file" bind=photos`,/requires nullable File state, received list:file/);
  rejects(`component C:
    state photo = "bad"
    input type="file" bind=photo`,/requires nullable File state, received string/);
  rejects(`component C:
    state photo = null
    input:
        type="checkbox"
        on change:
            photo = event.file`,/Checkbox change events expose only event.checked/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    input:
        type="file"
        on change:
            photo = event.value`,/File input change events expose only event.file and event.files/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    input:
        type="file"
        on change:
            photo = event.files`,/event.files requires list:file state/);
  rejects(`component C:
    action uploadPhoto(file):
        post "/photos"
        upload "photo" = file
    button:
        on click:
            uploadPhoto(event.file)`,/Unknown state or prop "event"/);
  rejects(`component C:
    state photo = null
    action send(file):
        post "/send"
        body file
        response string
    input type="file" bind=photo
    input type="file" on change send(event.file)`,/cannot be serialized as JSON/);
  rejects(`component C:
    state files = [] as File
    action uploadFiles(incoming):
        post "/photos"
        upload "photos" = incoming
    input:
        type="file"
        on change:
            files = event.files
            uploadFiles(event.files)`,/Upload values require a File or Blob, received list:file/);
  rejects(`component C:
    state name = ""
    button:
        on click:
            name = null`,/matching state type/);
  rejects(`component C:
    state values = [null]
    p text="unused"`,/Lists cannot infer a type from null/);
  rejects(`component C(value = null):
    p text="unused"`,/Props cannot infer a type from null/);
  rejects(`class Item:
    value = null
component C:
    p text="unused"`,/Class fields cannot infer a type from null/);
  rejects(`shared Files:
    photo = null`,/Shared state defaults cannot infer a type from null/);
  rejects(`component C:
    state photo = null
    input type="file" bind=photo
    p text=str(photo)`,/File values are opaque/);
  rejects(`component C:
    state kind = "file"
    input type=kind`,/static string literal/);
  rejects(`component C:
    state photo = null
    input type="file" on change photo = event.file`,/direct action invocation/);
});
