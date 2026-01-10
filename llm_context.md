MDFLow checkpoint (current)
- Repo: /Users/xm401/projects/md. Bazel workspace with `libs/md/{common,book,flow,cme,utils,codegen}` created; `flow_library` macro wraps native cc_library.
- Common layer defines packet/feed/channel scaffolding; book layer implements pool-backed `OrderBook`, events, and L2 view; flow layer wires Channel→Decoder→Normalizer→BookBuilder→user.
- CME module currently mock-parses text lines; real Globex MDP3 binary decoder still missing pending official packet/SBE schema.
- Reflection tool (`libs/md/codegen/genreflect.py`) emits simple type lists.
- Dummy tests (`order_book_test`, `flow_book_builder_test`, `cme_test`) run via `bazel test //libs/md/...` and pass.
- Next: obtain CME MDP3 Binary Packet + SBE schema to implement proper decoder, integrate PCAP reader, and add regression test against `dc3-glbx-a-20230716T110000.pcap`.
