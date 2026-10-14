package pt.catarinacandeias.sala;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends ComponentActivity {
    private static final String SITE = "https://candeiassantiago393-spec.github.io/catarinacandeias/";
    private WebView web;
    private ValueCallback<Uri[]> escolha;

    private final androidx.activity.result.ActivityResultLauncher<Intent> escolherFicheiro =
        registerForActivityResult(new androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(), resultado -> {
            if (escolha == null) return;
            Uri[] uris = WebChromeClient.FileChooserParams.parseResult(resultado.getResultCode(), resultado.getData());
            escolha.onReceiveValue(uris);
            escolha = null;
        });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        web = new WebView(this);
        setContentView(web);
        WebSettings defs = web.getSettings();
        defs.setJavaScriptEnabled(true);
        defs.setDomStorageEnabled(true);
        defs.setMediaPlaybackRequiresUserGesture(false);
        defs.setAllowFileAccess(false);
        web.setBackgroundColor(0xFF0C0B0A);
        web.addJavascriptInterface(new Ponte(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String anfitriao = uri.getHost() == null ? "" : uri.getHost();
                if (anfitriao.endsWith("github.io") || anfitriao.endsWith("googleapis.com") || anfitriao.endsWith("gstatic.com")) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (escolha != null) escolha.onReceiveValue(null);
                escolha = callback;
                try {
                    escolherFicheiro.launch(params.createIntent());
                } catch (Exception erro) {
                    escolha = null;
                    return false;
                }
                return true;
            }
        });
        web.loadUrl(SITE);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web != null && web.canGoBack()) web.goBack();
                else finish();
            }
        });
    }

    private class Ponte {
        @JavascriptInterface
        public void partilhar(String nome, String texto) {
            runOnUiThread(() -> {
                try {
                    File pasta = new File(getCacheDir(), "partilhas");
                    if (!pasta.exists() && !pasta.mkdirs()) return;
                    File ficheiro = new File(pasta, nome.replaceAll("[^a-zA-Z0-9._-]", "_"));
                    try (FileOutputStream saida = new FileOutputStream(ficheiro)) {
                        saida.write(texto.getBytes(StandardCharsets.UTF_8));
                    }
                    Uri uri = androidx.core.content.FileProvider.getUriForFile(
                        MainActivity.this,
                        getPackageName() + ".ficheiros",
                        ficheiro
                    );
                    Intent envio = new Intent(Intent.ACTION_SEND);
                    envio.setType("application/json");
                    envio.putExtra(Intent.EXTRA_STREAM, uri);
                    envio.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(envio, "Enviar"));
                } catch (Exception ignorado) {
                    /* o cliente volta a carregar em Enviar */
                }
            });
        }
    }
}
