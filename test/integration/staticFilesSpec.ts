import express = require("express");
import fs = require("fs");
import path = require("path");
import request = require("supertest");
import streamEqual = require("stream-equal");
import twilio = require("twilio");
import lib from "../../lib/";
import { filesConfig, stateRenderingUrlFor } from "../util";

const musicPath = path.join(__dirname, "../fixtures/music/");
const hashOfTammyMp3 = "23241bfb2abddb6f58a1e67e99565ec5";

describe("versioned static files", () => {
  describe("serving static files", () => {
    // We use this function to check if the res's contents are the same as
    // Tammy.mp3; if they are, we modify res.body to some known value, which
    // we can then assert on. Note: we have to compare the streams in parse(),
    // not end(), because superagent seems to do some weird buffering or
    // mutating on the response stream even if we say buffer(false). We also
    // have to set res.body to an object literal not a simple string; the latter
    // would be nicer, but, when we assert on the body's contents, supertest
    // will look in res.text (not res.body) if our assertion is a string.
    const parseMp3FileResponse = (res: any, cb: any) => {
      let musicStream = fs.createReadStream(path.join(musicPath, "Tammy.mp3"));
      streamEqual(res, musicStream, (err, streamsAreEqual) => {
        cb(err, streamsAreEqual ? {msg: "True"} : {msg: "Unequal Contents"});
      });
    };

    it("should work when there's no static files url prefix (mount path)", () => {
      let app = lib([], filesConfig({ path: musicPath }));
      let agent = request.agent(app);

      return agent
        .get("/Tammy.mp3")
        .parse(parseMp3FileResponse)
        .expect({msg: "True"});
    });

    it("should work when there is a static files url prefix (mount path)", () => {
      let app = lib([], filesConfig({ path: musicPath, mountPath: '/static' }));
      let agent = request.agent(app);

      return agent
        .get("/static/Tammy.mp3")
        .parse(parseMp3FileResponse)
        .buffer()
        .expect({msg: "True"});
    });

    it("should include a far future cache header with the files", () => {
      let app = lib([], filesConfig({ path: musicPath }));
      let agent = request.agent(app);

      return agent
        .get(`/Tammy.mp3?v=${hashOfTammyMp3}`)
        .expect("Cache-Control", "public, max-age=31536000")
        .expect((res: request.Response) => {
          if(!res.header.expires)
            throw new Error("expires header expected");
        });
    });

    it("should fall through when the file doesn't exist", () => {
      let outerApp = express();
      let app = lib([], filesConfig({ path: musicPath }));

      outerApp.use(app);
      outerApp.use((req, res, next) => {
        res.status(404).send("My Custom 404zzz.");
      });

      return request(outerApp)
        .get("/unknownfile.mp3")
        .expect(404, "My Custom 404zzz.");
    });
  });

  describe("urlFor", () => {
    it("should account for the static files prefix, if any", () => {
      let tammyUrlState = stateRenderingUrlFor("/static/Tammy.mp3", "/only-state");
      let app = lib([tammyUrlState], filesConfig({ path: musicPath, mountPath: '/static' }));

      return request(app)
        .post("/only-state")
        .expect(new RegExp("/static/Tammy\\.mp3\\?v=" + hashOfTammyMp3));
    });
  })
});
