using System;
using System.Configuration;
using System.Net.Http;
using System.Text;
using System.Web.Security;
using System.Web.UI;
using Newtonsoft.Json;

namespace ContosoStore.Web
{
    public partial class Login : Page
    {
        protected void btnLogin_Click(object sender, EventArgs e)
        {
            using var http = new HttpClient { BaseAddress = new Uri(ConfigurationManager.AppSettings["ApiBaseUrl"]) };
            var payload = JsonConvert.SerializeObject(new { email = txtEmail.Text, password = txtPassword.Text });
            var resp = http.PostAsync("auth/login", new StringContent(payload, Encoding.UTF8, "application/json")).Result;
            if (!resp.IsSuccessStatusCode) { lblError.Text = "Invalid credentials"; return; }
            dynamic body = JsonConvert.DeserializeObject(resp.Content.ReadAsStringAsync().Result);
            var token = (string)body.token;
            var ticket = new FormsAuthenticationTicket(1, txtEmail.Text, DateTime.Now,
                            DateTime.Now.AddMinutes(60), false, token);
            var enc = FormsAuthentication.Encrypt(ticket);
            Response.Cookies.Add(new System.Web.HttpCookie(FormsAuthentication.FormsCookieName, enc));
            Response.Redirect("~/Products.aspx");
        }
    }
}
