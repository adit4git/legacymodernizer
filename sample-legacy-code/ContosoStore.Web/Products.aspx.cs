using System;
using System.Collections.Generic;
using System.Configuration;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Web.Security;
using System.Web.UI;
using System.Web.UI.WebControls;
using Newtonsoft.Json;

namespace ContosoStore.Web
{
    public partial class Products : Page
    {
        private static readonly HttpClient _http = new HttpClient
        {
            BaseAddress = new Uri(ConfigurationManager.AppSettings["ApiBaseUrl"])
        };

        protected void Page_Load(object sender, EventArgs e)
        {
            if (!IsPostBack) BindProducts();
        }

        protected void ddlCategory_Changed(object s, EventArgs e) => BindProducts();
        protected void btnSearch_Click(object s, EventArgs e) => BindProducts();
        protected void gvProducts_PageIndexChanging(object s, GridViewPageEventArgs e)
        {
            gvProducts.PageIndex = e.NewPageIndex;
            BindProducts();
        }

        protected void ProductCommand(object s, CommandEventArgs e)
        {
            if (e.CommandName == "EditProduct")
                Response.Redirect($"~/EditProduct.aspx?id={e.CommandArgument}");
        }

        protected bool IsAdmin() =>
            User.IsInRole("Admin") || User.IsInRole("ProductManager");

        private void BindProducts()
        {
            var token = ((FormsIdentity)User.Identity).Ticket.UserData;
            _http.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", token);

            var cat = ddlCategory.SelectedValue;
            var url = $"products?page={gvProducts.PageIndex + 1}&size={gvProducts.PageSize}";
            if (!string.IsNullOrEmpty(cat)) url += $"&category={cat}";

            var json = _http.GetStringAsync(url).GetAwaiter().GetResult();
            var products = JsonConvert.DeserializeObject<List<dynamic>>(json);
            gvProducts.DataSource = products;
            gvProducts.DataBind();
        }
    }
}
